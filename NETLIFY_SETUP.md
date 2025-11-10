# Netlify Deployment Setup Guide

هذا الدليل يشرح كيفية إعداد النشر على Netlify لموقعك.

## الخطوات المطلوبة

### 1. إنشاء Netlify OAuth Application

1. اذهب إلى: https://app.netlify.com/user/applications
2. اضغط على **"New OAuth application"**
3. املأ النموذج:
   - **Application name**: اسم التطبيق (مثلاً: "Youssef AI" أو أي اسم تريده)
   - **Redirect URI**: 
     - للتطوير المحلي: `http://localhost:3000/api/netlify/callback`
     - للإنتاج: `https://zentra-ai.ymoo.site/api/netlify/callback`

4. بعد الإنشاء، سيظهر لك:
   - **Client ID**: انسخه
   - **Client Secret**: انسخه

### 2. إضافة المعلومات في ملف .env.local

أضف المتغيرات التالية في ملف `.env.local`:

```bash
# Netlify OAuth Credentials
NETLIFY_CLIENT_ID=dWFwlcbJDNTGfI6_yAHKv98EHHWGRFNv6HZ12HSHb_8
NETLIFY_CLIENT_SECRET=EkGzCqouty-lMQALkLTZhetxKzPOWgVw785WKey1MGo

# Redirect URI (يجب أن يكون نفس الموجود في Netlify OAuth App)
NETLIFY_REDIRECT_URI=https://zentra-ai.ymoo.site/api/netlify/callback
```

**مهم:** في حالة النشر على Vercel أو أي خدمة استضافة أخرى، تأكد من إضافة هذه المتغيرات في إعدادات البيئة (Environment Variables).

### 3. إعادة تشغيل التطبيق

بعد إضافة المتغيرات، أعد تشغيل التطبيق:

```bash
npm run dev
```

## كيفية الاستخدام

### 1. ربط حساب Netlify

1. اضغط على زر **"Connect"** في الواجهة (سيظهر في الهيدر)
2. سيتم توجيهك إلى صفحة Netlify للمصادقة
3. اضغط على **"Authorize"**
4. سيتم إرجاعك للموقع وسترى رسالة نجاح

### 2. نشر الموقع

1. بعد توليد الكود، اضغط على زر **"Publish"** (سيكون باللون الأزرق المائل للأخضر)
2. انتظر حتى يتم النشر (ستظهر رسالة في الشات)
3. سيعطيك رابط الموقع المنشور على Netlify

## ملاحظات مهمة

### Redirect URI في Netlify

**يجب** أن تكون قيمة `NETLIFY_REDIRECT_URI` في ملف `.env.local` **مطابقة تماماً** لما أدخلته في Netlify OAuth App.

#### للتطوير المحلي:
```
http://localhost:3000/api/netlify/callback
```

#### للإنتاج:
```
https://zentra-ai.ymoo.site/api/netlify/callback
```

أو إذا كان لديك دومين آخر:
```
https://your-domain.com/api/netlify/callback
```

### في Vercel

عند النشر على Vercel، أضف المتغيرات في:
1. اذهب إلى Dashboard → Project Settings → Environment Variables
2. أضف المتغيرات الثلاثة:
   - `NETLIFY_CLIENT_ID`
   - `NETLIFY_CLIENT_SECRET`
   - `NETLIFY_REDIRECT_URI`

### إذا كان لديك أكثر من بيئة

يمكنك إنشاء أكثر من Netlify OAuth Application، واحد لكل بيئة:
- **Development**: `http://localhost:3000/api/netlify/callback`
- **Preview/Staging**: `https://preview.your-domain.com/api/netlify/callback`
- **Production**: `https://your-domain.com/api/netlify/callback`

## استكشاف الأخطاء

### خطأ "Not authenticated with Netlify"
- تأكد من أنك ضغطت على زر "Connect" أولاً
- تأكد من أن المتغيرات موجودة في `.env.local`

### خطأ "OAuth token exchange failed"
- تأكد من أن `NETLIFY_CLIENT_ID` و `NETLIFY_CLIENT_SECRET` صحيحين
- تأكد من أن `NETLIFY_REDIRECT_URI` مطابق لما في Netlify

### خطأ "Deployment failed"
- تأكد من أن الكود تم توليده بنجاح أولاً
- تحقق من أن حساب Netlify لديه مساحة كافية

## الخلاصة

الآن بعد الإعداد، يمكنك:
1. توليد أي موقع باستخدام AI
2. الضغط على **"Publish"** لنشره على Netlify مباشرة
3. الحصول على رابط مباشر للموقع المنشور

✨ **تم!** موقعك الآن يدعم النشر المباشر على Netlify!
