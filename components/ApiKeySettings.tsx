'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiKeys } from '@/contexts/ApiKeysContext';

const ApiKeySettings = ({ onClose }: { onClose: () => void }) => {
  const { apiKeys, setApiKeys } = useApiKeys();
  const [localKeys, setLocalKeys] = useState(apiKeys);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLocalKeys(apiKeys);
  }, [apiKeys]);

  const handleInputChange = (service: string, value: string) => {
    setLocalKeys(prev => ({ ...prev, [service]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      setApiKeys(localKeys);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError('Failed to save API keys.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium mb-4">API Keys</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Provide your OpenRouter API key to generate code, and the E2B key to run the editable sandbox. Other keys are optional.
      </p>
      <div className="space-y-4">
        {[
          { key: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', required: true },
          { key: 'e2b', label: 'E2B Sandbox', placeholder: 'e2b_...', required: true },
          { key: 'netlify', label: 'Netlify Token', placeholder: 'nfp_...', required: false, help: '🌐 Get from: https://app.netlify.com/user/applications#personal-access-tokens' },
          { key: 'vercel', label: 'Vercel Token', placeholder: 'vercel_...', required: false, help: '▲ Get from: https://vercel.com/account/tokens' },
          { key: 'firecrawl', label: 'Firecrawl (optional)', placeholder: 'fc-...', required: false },
        ].map(({ key, label, placeholder, required, help }) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={key}>{label}</Label>
              {required && <span className="text-xs text-muted-foreground uppercase">Required</span>}
            </div>
            <Input
              id={key}
              type="password"
              placeholder={placeholder}
              value={localKeys[key] || ''}
              onChange={(e) => handleInputChange(key, e.target.value)}
            />
            {help && <p className="text-xs text-muted-foreground">{help}</p>}
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-red-500 mt-2">{error}</p>}
      {success && <p className="text-green-500 mt-2">API keys saved successfully!</p>}
    </div>
  );
};

export default ApiKeySettings;
