import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { siteName, files } = await request.json();
    
    // Get Netlify token from cookie
    const netlifyToken = request.cookies.get('netlify_token')?.value;
    
    if (!netlifyToken) {
      return NextResponse.json({ 
        error: 'Not authenticated with Netlify. Please connect your Netlify account first.' 
      }, { status: 401 });
    }
    
    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ 
        error: 'No files to deploy' 
      }, { status: 400 });
    }
    
    console.log('[netlify-deploy] Starting deployment...');
    console.log('[netlify-deploy] Site name:', siteName);
    console.log('[netlify-deploy] Files count:', Object.keys(files).length);
    
    // Get user's sites
    const sitesResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
      },
    });
    
    if (!sitesResponse.ok) {
      throw new Error('Failed to fetch Netlify sites');
    }
    
    const sites = await sitesResponse.json();
    let siteId = null;
    
    // Check if site exists
    const existingSite = sites.find((site: any) => site.name === siteName);
    
    if (existingSite) {
      siteId = existingSite.id;
      console.log('[netlify-deploy] Found existing site:', siteId);
    } else {
      // Create new site
      console.log('[netlify-deploy] Creating new site...');
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
        throw new Error('Failed to create Netlify site');
      }
      
      const newSite = await createSiteResponse.json();
      siteId = newSite.id;
      console.log('[netlify-deploy] Created new site:', siteId);
    }
    
    // Prepare files for deployment
    const deployFiles: { [key: string]: string } = {};
    
    for (const [path, content] of Object.entries(files)) {
      // Remove leading slash and 'src/' prefix for proper deployment
      const cleanPath = path.replace(/^\//, '').replace(/^src\//, '');
      deployFiles[cleanPath] = content as string;
    }
    
    // Add an index.html if not present
    if (!deployFiles['index.html']) {
      deployFiles['index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
    <script type="module" crossorigin src="/App.jsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    }
    
    console.log('[netlify-deploy] Deploying files:', Object.keys(deployFiles));
    
    // Create deployment
    const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: deployFiles,
      }),
    });
    
    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error('[netlify-deploy] Deployment failed:', errorText);
      throw new Error('Failed to create deployment');
    }
    
    const deployment = await deployResponse.json();
    console.log('[netlify-deploy] Deployment created:', deployment.id);
    
    // Wait a bit for deployment to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return NextResponse.json({
      success: true,
      deploymentId: deployment.id,
      siteId: siteId,
      url: deployment.deploy_ssl_url || deployment.url,
      adminUrl: deployment.admin_url,
    });
    
  } catch (error) {
    console.error('[netlify-deploy] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Deployment failed' 
    }, { status: 500 });
  }
}
