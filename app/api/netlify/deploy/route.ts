import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

// Helper function to create SHA1 hash
function createSHA1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

// Helper function to check deployment status
async function waitForDeployment(
  deployId: string, 
  netlifyToken: string,
  onProgress?: (status: string) => void
): Promise<any> {
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to check deployment status');
    }
    
    const deploy = await response.json();
    console.log(`[netlify-deploy] Status: ${deploy.state}`);
    
    if (onProgress) {
      onProgress(deploy.state);
    }
    
    // Deployment states: "uploading", "uploaded", "processing", "ready", "error"
    if (deploy.state === 'ready') {
      return deploy;
    }
    
    if (deploy.state === 'error') {
      throw new Error(`Deployment failed: ${deploy.error_message || 'Unknown error'}`);
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('Deployment timeout - took too long to complete');
}

export async function POST(request: NextRequest) {
  try {
    const { siteName, files, netlifyToken: bodyToken } = await request.json();
    
    // Get Netlify token from request body or header
    const netlifyToken = bodyToken || request.headers.get('X-Netlify-Token') || request.cookies.get('netlify_token')?.value;
    
    if (!netlifyToken) {
      return NextResponse.json({ 
        error: 'Netlify token not provided. Please add your Netlify Personal Access Token in API Keys settings.' 
      }, { status: 401 });
    }
    
    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ 
        error: 'No files to deploy' 
      }, { status: 400 });
    }
    
    console.log('[netlify-deploy] 🚀 Starting deployment...');
    console.log('[netlify-deploy] Site name:', siteName);
    console.log('[netlify-deploy] Files count:', Object.keys(files).length);
    
    // Step 1: Get or create site
    console.log('[netlify-deploy] 📡 Fetching sites...');
    const sitesResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
      },
    });
    
    if (!sitesResponse.ok) {
      const errorText = await sitesResponse.text();
      console.error('[netlify-deploy] Failed to fetch sites:', errorText);
      throw new Error('Failed to authenticate with Netlify. Please check your token.');
    }
    
    const sites = await sitesResponse.json();
    let siteId = null;
    let siteUrl = null;
    
    // Check if site exists
    const existingSite = sites.find((site: any) => site.name === siteName);
    
    if (existingSite) {
      siteId = existingSite.id;
      siteUrl = existingSite.ssl_url || existingSite.url;
      console.log('[netlify-deploy] ✅ Found existing site:', siteId);
      console.log('[netlify-deploy] 🌐 Site URL:', siteUrl);
    } else {
      // Create new site
      console.log('[netlify-deploy] 🏗️ Creating new site...');
      const createSiteResponse = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${netlifyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: siteName,
        }),
      });
      
      if (!createSiteResponse.ok) {
        const errorText = await createSiteResponse.text();
        console.error('[netlify-deploy] Failed to create site:', errorText);
        throw new Error('Failed to create Netlify site. Site name might be taken.');
      }
      
      const newSite = await createSiteResponse.json();
      siteId = newSite.id;
      siteUrl = newSite.ssl_url || newSite.url;
      console.log('[netlify-deploy] ✅ Created new site:', siteId);
      console.log('[netlify-deploy] 🌐 Site URL:', siteUrl);
    }
    
    // Step 2: Prepare files for deployment
    const deployFiles: { [key: string]: string } = {};
    const fileHashes: { [key: string]: string } = {};
    
    console.log('[netlify-deploy] 📦 Processing files...');
    
    // Process all files
    for (const [path, content] of Object.entries(files)) {
      const cleanPath = path.replace(/^\/+/, '');
      const fileContent = content as string;
      
      deployFiles[cleanPath] = fileContent;
      fileHashes[cleanPath] = createSHA1(fileContent);
      
      console.log(`[netlify-deploy] ✓ ${cleanPath} (${fileContent.length} bytes)`);
    }
    
    // Ensure we have index.html at the root
    if (!deployFiles['index.html']) {
      console.log('[netlify-deploy] 📝 Creating index.html...');
      
      const hasAppJsx = deployFiles['src/App.jsx'] || deployFiles['App.jsx'];
      const hasMainJsx = deployFiles['src/main.jsx'] || deployFiles['main.jsx'];
      
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Awesome App - Created by Youssef AI</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      #root { width: 100%; }
      .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 40px 20px;
        text-align: center;
      }
      h1 {
        color: white;
        font-size: 3rem;
        margin-bottom: 20px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        animation: fadeIn 0.8s ease-in;
      }
      p {
        color: rgba(255,255,255,0.9);
        font-size: 1.2rem;
        line-height: 1.6;
        margin-bottom: 30px;
      }
      .code-preview {
        background: rgba(0,0,0,0.2);
        border-radius: 12px;
        padding: 20px;
        margin-top: 30px;
        backdrop-filter: blur(10px);
      }
      .file-list {
        text-align: left;
        color: rgba(255,255,255,0.8);
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 14px;
        max-height: 400px;
        overflow-y: auto;
      }
      .file-list div {
        padding: 5px 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .badge {
        display: inline-block;
        background: rgba(255,255,255,0.2);
        padding: 8px 16px;
        border-radius: 20px;
        margin: 5px;
        color: white;
        font-size: 14px;
        backdrop-filter: blur(10px);
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div class="container">
        <h1>🎉 Your App is Live!</h1>
        <p>This site was generated by Youssef AI and successfully deployed to Netlify.</p>
        <div class="code-preview">
          <div class="file-list">
            <h3 style="color: white; margin-bottom: 15px;">📁 Deployed Files (${Object.keys(deployFiles).length}):</h3>
            ${Object.keys(deployFiles).map(f => `<div>📄 ${f}</div>`).join('')}
          </div>
        </div>
        <div style="margin-top: 30px;">
          ${hasAppJsx ? '<div class="badge">⚛️ React App</div>' : ''}
          ${hasMainJsx ? '<div class="badge">🚀 Vite Powered</div>' : ''}
          <div class="badge">✨ AI Generated</div>
          <div class="badge">🌐 Netlify Hosted</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
      
      deployFiles['index.html'] = indexHtml;
      fileHashes['index.html'] = createSHA1(indexHtml);
    }
    
    console.log('[netlify-deploy] 📊 Total files to deploy:', Object.keys(deployFiles).length);
    
    // Step 3: Create deployment with file hashes
    console.log('[netlify-deploy] 🎯 Creating deployment...');
    const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: fileHashes,
      }),
    });
    
    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error('[netlify-deploy] Deployment creation failed:', errorText);
      throw new Error('Failed to create deployment on Netlify');
    }
    
    const deployment = await deployResponse.json();
    const deployId = deployment.id;
    const requiredFiles = deployment.required || [];
    
    console.log('[netlify-deploy] ✅ Deployment created:', deployId);
    console.log('[netlify-deploy] 📤 Files to upload:', requiredFiles.length);
    
    // Step 4: Upload required files
    if (requiredFiles.length > 0) {
      console.log('[netlify-deploy] ⬆️ Uploading files...');
      
      for (const filePath of requiredFiles) {
        const fileContent = deployFiles[filePath];
        if (!fileContent) {
          console.error(`[netlify-deploy] File not found: ${filePath}`);
          continue;
        }
        
        const uploadResponse = await fetch(
          `https://api.netlify.com/api/v1/deploys/${deployId}/files/${filePath}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${netlifyToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: fileContent,
          }
        );
        
        if (!uploadResponse.ok) {
          console.error(`[netlify-deploy] Failed to upload ${filePath}`);
        } else {
          console.log(`[netlify-deploy] ✓ Uploaded: ${filePath}`);
        }
      }
    } else {
      console.log('[netlify-deploy] ℹ️ No new files to upload (using cached versions)');
    }
    
    // Step 5: Wait for deployment to complete
    console.log('[netlify-deploy] ⏳ Waiting for deployment to complete...');
    
    const completedDeploy = await waitForDeployment(
      deployId,
      netlifyToken,
      (status) => {
        console.log(`[netlify-deploy] 📊 Status: ${status}`);
      }
    );
    
    const finalUrl = completedDeploy.ssl_url || completedDeploy.url || siteUrl;
    
    console.log('[netlify-deploy] ✅ Deployment completed successfully!');
    console.log('[netlify-deploy] 🌐 Live URL:', finalUrl);
    
    return NextResponse.json({
      success: true,
      deploymentId: deployId,
      siteId: siteId,
      url: finalUrl,
      adminUrl: completedDeploy.admin_url,
      state: completedDeploy.state,
      createdAt: completedDeploy.created_at,
    });
    
  } catch (error) {
    console.error('[netlify-deploy] ❌ Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Deployment failed',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
