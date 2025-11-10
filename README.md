
# Youssef AI – Conversational App Builder 🚀

**Design, build, and remix web experiences with AI**

Describe the product you want and let Youssef AI turn it into a modern, responsive application. Iterate in real time, inspect the generated code, and deploy anywhere.

🌐 **Live Demo**: [youssef.ai](https://youssef.ai)

## ✨ Features

- 🌐 **URL-to-Website Magic**: Paste any URL and get a fully recreated website
- 🤖 **AI-Powered Intelligence**: Advanced AI understands layouts, content, and design patterns
- ⚡ **Lightning Fast**: Get a working website in minutes, not days
- 🎨 **Modern & Responsive**: Creates mobile-first, responsive applications
- 🔧 **Full Code Access**: Download complete source code for unlimited customization
- 🚀 **Deploy Anywhere**: Vercel, Netlify, or any hosting platform
- 🔒 **Secure Sandboxing**: Safe code execution in isolated environments
- 💾 **Smart Caching**: 500% faster scraping with intelligent caching
- 🗂️ **Project History**: Persist chats and generated code per user with Supabase

## 🎯 How It Works

### The Magic Behind the Scenes

1. **🔍 Intelligent Scraping**
   - Uses Firecrawl to extract content, structure, and metadata
   - Handles dynamic content, SPAs, and complex layouts
   - Respects robots.txt and implements smart retry logic

2. **🧠 AI Analysis & Generation**
   - OpenRouter’s multi-provider marketplace (Anthropic, Google, DeepSeek, Moonshot, MiniMax, Qwen, and more) analyzes the content
   - Understands design patterns, component structure, and user flows
   - Generates clean, semantic React components with TypeScript

3. **⚡ Real-time Development**
   - E2B sandboxes provide secure, isolated development environments
   - Live preview with hot reloading as code is generated
   - Automatic dependency management and build optimization

4. **🎨 Modern Tech Stack**
   - **React 18** with functional components and hooks
   - **Next.js 15** for optimal performance and SEO
   - **TypeScript** for type safety and better developer experience
   - **Tailwind CSS** for utility-first styling
   - **Responsive Design** that works on all devices

5. **📦 Production Ready**
   - Optimized builds with code splitting
   - SEO-friendly with proper meta tags
   - Performance optimized with lazy loading
   - Accessibility compliant (WCAG guidelines)

## 🛠️ Tech Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Frontend** | Next.js 15, React 18, TypeScript | Modern web application framework |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **AI Providers** | OpenRouter (Claude, Gemini, DeepSeek, Moonshot, Qwen, MiniMax) | Content analysis and code generation |
| **Web Scraping** | Firecrawl | Reliable content extraction |
| **Sandboxing** | E2B | Secure code execution environment |
| **Deployment** | Vercel | Serverless deployment platform |
| **State Management** | React Hooks, Context API | Client-side state management |

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **npm/yarn/pnpm**
- **API Keys** (see configuration below)

### 1. Clone & Install

```bash
git clone https://github.com/youssef-official/Open-lovable-DIY.git
cd Open-lovable-DIY
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env.local
```

Add your API keys to `.env.local`:

```env
# REQUIRED - Code execution sandboxes
E2B_API_KEY=e2b_your_api_key_here

# REQUIRED - Web scraping engine
FIRECRAWL_API_KEY=fc-your_api_key_here

# REQUIRED - AI inference via OpenRouter
OPENROUTER_API_KEY=or_your_api_key_here

# REQUIRED - Persistent storage (Supabase)
SUPABASE_URL=https://eovdsfouwvgtvlhxmqya.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_or_service_key

# OPTIONAL - OpenRouter overrides
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_HTTP_REFERER=https://your-app-domain.com
# OPENROUTER_APP_NAME=Youssef AI
```

### 2.1 Database Setup (Supabase)

1. Create a new Supabase project (or use the provided instance).
2. Open the SQL editor and run the script in `Full/txt.sql` to provision tables and indexes.
3. Add the `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or service role key) to your environment variables.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start creating! 🎉

## 🔑 API Keys Setup

### Required Services

| Service | Purpose | Get API Key | Free Tier |
|---------|---------|-------------|-----------|
| **OpenRouter** | Unified gateway to Claude, Gemini, DeepSeek, Moonshot, Qwen, MiniMax | [openrouter.ai](https://openrouter.ai) | ✅ Yes |
| **E2B** | Secure code execution | [e2b.dev](https://e2b.dev) | ✅ Yes |
| **Firecrawl** | Web scraping | [firecrawl.dev](https://firecrawl.dev) | ✅ Yes |

## 🌐 Deployment on Vercel

### Automatic Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/youssef-official/Open-lovable-DIY)

### Manual Deployment

1. **Fork this repository**
2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your forked repository
3. **Configure Environment Variables**:
   - Add all required API keys in Vercel dashboard
   - Go to Project Settings → Environment Variables
4. **Custom Domain** (optional):
   - Add `youssef.ai` (or your custom domain) in Vercel Domains
   - Configure DNS records as instructed
5. **Deploy!** 🚀

### Environment Variables for Production

In your Vercel dashboard, add these environment variables:

```
OPENROUTER_API_KEY=your_production_openrouter_key
E2B_API_KEY=your_production_e2b_key
FIRECRAWL_API_KEY=your_production_firecrawl_key
SUPABASE_URL=https://eovdsfouwvgtvlhxmqya.supabase.co
SUPABASE_ANON_KEY=your_supabase_service_key
# Optional OpenRouter overrides
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_HTTP_REFERER=https://your-app-domain.com
# OPENROUTER_APP_NAME=Youssef AI
```

## 📁 Project Structure

```
Open-lovable-DIY/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── create-ai-sandbox/     # Sandbox management
│   │   ├── scrape-url-enhanced/   # Web scraping
│   │   ├── generate-ai-code/      # AI code generation
│   │   └── validate-api-key/      # API key validation
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx          # Main application page
├── components/            # Reusable React components
│   ├── ui/               # UI components
│   ├── ApiKeysModal.tsx  # API key configuration
│   └── ...
├── lib/                  # Utility libraries
│   ├── api-keys.ts       # API key management
│   ├── api-key-utils.ts  # API utilities
│   └── utils.ts          # General utilities
├── hooks/                # Custom React hooks
├── config/               # Configuration files
└── public/              # Static assets
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **🍴 Fork the repository**
2. **🌿 Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **💻 Make your changes**
4. **✅ Test thoroughly**
5. **📝 Commit**: `git commit -m 'Add amazing feature'`
6. **🚀 Push**: `git push origin feature/amazing-feature`
7. **🔄 Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Community

- **🐛 Bug Reports**: [GitHub Issues](https://github.com/youssef-official/Open-lovable-DIY/issues)
- **💡 Feature Requests**: [GitHub Discussions](https://github.com/youssef-official/Open-lovable-DIY/discussions)
- **📧 Email**: support@youssef.ai
- **🐦 Twitter**: [@youssefai](https://twitter.com/youssefai)

## 🙏 Acknowledgments

- **Lovable.dev** - Inspiration for this open-source alternative
- **Firecrawl** - Reliable web scraping infrastructure
- **E2B** - Secure code execution sandboxes
- **Vercel** - Seamless deployment platform
- **Open Source Community** - For making this possible

---

**Crafted with care by the Youssef AI community**

⭐ **Star this repo** if you find it useful!
