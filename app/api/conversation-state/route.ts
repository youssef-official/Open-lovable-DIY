import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { ConversationState } from '@/types/conversation';
import { authOptions } from '@/lib/auth';
import { ProjectRepository } from '@/lib/projects';

declare global {
  var conversationState: ConversationState | null;
}

// GET: Retrieve current conversation state
export async function GET() {
  try {
    if (!global.conversationState) {
      return NextResponse.json({
        success: true,
        state: null,
        message: 'No active conversation'
      });
    }
    
    return NextResponse.json({
      success: true,
      state: global.conversationState
    });
  } catch (error) {
    console.error('[conversation-state] Error getting state:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

// POST: Reset or update conversation state
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { action, data, projectId, state: providedState } = await request.json();
    const sandboxId = data?.sandboxId as string | undefined;
    const lastPrompt = data?.lastPrompt as string | undefined;
    
    switch (action) {
      case 'reset':
        global.conversationState = createEmptyConversationState();
        await persistStateIfPossible({
          userId,
          projectId,
          state: global.conversationState,
          sandboxId,
          lastPrompt,
        });
        
        console.log('[conversation-state] Reset conversation state');
        
        return NextResponse.json({
          success: true,
          message: 'Conversation state reset',
          state: global.conversationState
        });
        
      case 'clear-old': {
        if (!global.conversationState) {
          console.log('[conversation-state] No existing state. Creating new before clear-old.');
          global.conversationState = createEmptyConversationState();
        }

        global.conversationState.context.messages =
          global.conversationState.context.messages.slice(-5);
        global.conversationState.context.edits =
          global.conversationState.context.edits.slice(-3);
        global.conversationState.context.projectEvolution.majorChanges =
          global.conversationState.context.projectEvolution.majorChanges.slice(-2);

        console.log('[conversation-state] Cleared old conversation data');

        await persistStateIfPossible({
          userId,
          projectId,
          state: global.conversationState,
          sandboxId,
          lastPrompt,
        });

        return NextResponse.json({
          success: true,
          message: 'Old conversation data cleared',
          state: global.conversationState,
        });
      }

      case 'hydrate': {
        if (!providedState) {
          return NextResponse.json(
            { success: false, error: 'State payload is required for hydrate action' },
            { status: 400 }
          );
        }

        global.conversationState = providedState as ConversationState;
        global.conversationState.lastUpdated = Date.now();

        console.log('[conversation-state] Hydrated conversation state from persisted data');

        await persistStateIfPossible({
          userId,
          projectId,
          state: global.conversationState,
          sandboxId,
          lastPrompt,
        });

        return NextResponse.json({
          success: true,
          message: 'Conversation state hydrated',
          state: global.conversationState,
        });
      }

      case 'update':
        if (!global.conversationState) {
          console.log('[conversation-state] No state on update. Creating fresh state.');
          global.conversationState = createEmptyConversationState();
        }
        
        // Update specific fields if provided
        if (data) {
          if (data.currentTopic) {
            global.conversationState.context.currentTopic = data.currentTopic;
          }
          if (data.userPreferences) {
            global.conversationState.context.userPreferences = {
              ...global.conversationState.context.userPreferences,
              ...data.userPreferences
            };
          }
          
          global.conversationState.lastUpdated = Date.now();
        }

        await persistStateIfPossible({
          userId,
          projectId,
          state: global.conversationState,
          sandboxId,
          lastPrompt,
        });

        return NextResponse.json({
          success: true,
          message: 'Conversation state updated',
          state: global.conversationState
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use "reset" or "update"'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[conversation-state] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

// DELETE: Clear conversation state
export async function DELETE() {
  try {
    global.conversationState = null;
    
    console.log('[conversation-state] Cleared conversation state');
    
    return NextResponse.json({
      success: true,
      message: 'Conversation state cleared'
    });
  } catch (error) {
    console.error('[conversation-state] Error clearing state:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }

}

function createEmptyConversationState(): ConversationState {
  return {
    conversationId: `conv-${Date.now()}`,
    startedAt: Date.now(),
    lastUpdated: Date.now(),
    context: {
      messages: [],
      edits: [],
      projectEvolution: { majorChanges: [] },
      userPreferences: {}
    }
  };
}

async function persistStateIfPossible(params: {
  userId?: string;
  projectId?: string;
  state: ConversationState;
  sandboxId?: string;
  lastPrompt?: string;
}) {
  if (!params.userId || !params.projectId) {
    return;
  }

  try {
    await ProjectRepository.saveState({
      userId: params.userId,
      projectId: params.projectId,
      state: params.state,
      sandboxId: params.sandboxId,
      lastPrompt: params.lastPrompt,
    });
  } catch (error) {
    console.error('[conversation-state] Failed to persist project state:', error);
  }
}