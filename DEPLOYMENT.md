# 🚀 Deployment Guide for Youssef AI

This guide walks you through deploying Youssef AI to Vercel and configuring a custom domain such as `youssef.ai`.

## 📋 Prerequisites

Before deploying, make sure you have:
- ✅ GitHub account with the forked repository
- ✅ Vercel account (free tier is sufficient)
- ✅ All required API keys (OpenRouter, E2B, Firecrawl)
- ✅ Domain access to `youssef.ai` (or your chosen custom domain)

## 🌐 Deploy to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/youssef-official/Open-lovable-DIY)

### Option 2: Manual Deployment

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

2. **Import Project**
   - Click "New Project"
   - Select "Import Git Repository"
    - Choose `youssef-official/Open-lovable-DIY`

3. **Configure Project**
    - **Project Name**: `youssef-ai`
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

4. **Environment Variables**
   Add these in the Vercel dashboard:
```
OPENROUTER_API_KEY=your_openrouter_api_key
E2B_API_KEY=your_e2b_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
SUPABASE_URL=https://eovdsfouwvgtvlhxmqya.supabase.co
SUPABASE_ANON_KEY=your_supabase_service_key
# Optional overrides
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_HTTP_REFERER=https://your-app-domain.com
# OPENROUTER_APP_NAME=Youssef AI
NODE_ENV=production
```

> 🗂️ **Database Setup**  
> Run the SQL script in `Full/txt.sql` once to create the necessary tables in Supabase before deploying.

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete (usually 2-3 minutes)

## 🌍 Custom Domain Setup

### Configure youssef.ai Domain

1. **Add Domain in Vercel**
   - Go to your project dashboard
   - Click "Settings" → "Domains"
   - Add `youssef.ai` (or your custom domain)
   - Add `www.youssef.ai` if you want a www variant

2. **DNS Configuration**
   Configure these DNS records with your domain provider:
   
**For Apex Domain (youssef.ai):**
   ```
   Type: A
   Name: @
   Value: 76.76.19.61
   TTL: 3600
   ```
   
**For WWW Subdomain (www.youssef.ai):**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   TTL: 3600
   ```

3. **SSL Certificate**
   - Vercel automatically provisions SSL certificates
   - Wait 24-48 hours for DNS propagation
   - Verify HTTPS is working

## ⚙️ Production Configuration

### Environment Variables for Production

```env
# Required
OPENROUTER_API_KEY=or-production_key
E2B_API_KEY=e2b_production_key
FIRECRAWL_API_KEY=fc-production_key

# Optional OpenRouter overrides
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_HTTP_REFERER=https://your-app-domain.com
# OPENROUTER_APP_NAME=Youssef AI

# System
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://youssef.ai
```

### Performance Optimizations

The project includes several optimizations:
- ✅ **Vercel.json** configuration for optimal builds
- ✅ **API route timeouts** set to 300 seconds
- ✅ **CORS headers** configured
- ✅ **SEO optimization** with metadata and sitemaps
- ✅ **Smart caching** for faster scraping

## 🔍 Verification Steps

After deployment, verify these work:

1. **Homepage loads** at `https://youssef.ai`
2. **API key validation** works in settings
3. **Website cloning** functionality works
4. **Sandbox creation** works properly
5. **Error handling** displays user-friendly messages

## 🐛 Troubleshooting

### Common Issues

**Build Failures:**
- Check environment variables are set correctly
- Verify API keys are valid
- Check build logs in Vercel dashboard

**API Timeouts:**
- Increase function timeout in vercel.json
- Check API key limits and quotas
- Verify network connectivity

**Domain Issues:**
- Wait 24-48 hours for DNS propagation
- Use DNS checker tools to verify records
- Check SSL certificate status

### Getting Help

- **Vercel Support**: [vercel.com/support](https://vercel.com/support)
- **Project Issues**: [GitHub Issues](https://github.com/youssef-official/Open-lovable-DIY/issues)
- **Community**: [GitHub Discussions](https://github.com/youssef-official/Open-lovable-DIY/discussions)

## 🎉 Success!

Once deployed, your Youssef AI workspace will be live at:
- **Production**: https://youssef.ai
- **Vercel URL**: https://youssef-ai.vercel.app

Share your success and help others by contributing back to the project! 🚀
