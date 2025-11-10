import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ProjectRepository } from '@/lib/projects';

function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Authentication required' },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (projectId) {
      const project = await ProjectRepository.getProject(userId, projectId);
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        project,
      });
    }

    const projects = await ProjectRepository.listProjects(userId, Math.min(limit, 20));
    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    console.error('[projects] GET error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const name = (body.name as string | undefined)?.trim();
    const description = (body.description as string | undefined)?.trim();
    const initialPrompt = (body.initialPrompt as string | undefined)?.trim();
    const sandboxId = (body.sandboxId as string | undefined)?.trim();

    if (!name && !initialPrompt) {
      return NextResponse.json(
        { success: false, error: 'Project name or initial prompt is required' },
        { status: 400 }
      );
    }

    const project = await ProjectRepository.createProject({
      userId,
      name: name || generateProjectNameFromPrompt(initialPrompt!),
      description,
      initialPrompt,
      sandboxId,
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error('[projects] POST error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    await ProjectRepository.deleteProject(userId, projectId);

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('[projects] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

function generateProjectNameFromPrompt(prompt: string) {
  const sentence = prompt.split(/[.!?]/)[0] || prompt;
  const truncated = sentence.trim().slice(0, 60);
  if (!truncated) return 'Untitled Project';
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}
