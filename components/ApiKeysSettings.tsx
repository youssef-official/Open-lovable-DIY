'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { appConfig } from '@/config/app.config';
import { useApiKeys } from '@/contexts/ApiKeysContext';

const ApiKeysSettings = () => {
  const { apiKeys, setApiKeys } = useApiKeys();
  const [localKeys, setLocalKeys] = useState(apiKeys);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save API keys.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium mb-4">API Keys</h3>
      <div className="space-y-4">
        {appConfig.ai.availableModels.map(model => {
          const service = model.split('/')[0];
          return (
            <div key={service} className="space-y-2">
              <Label htmlFor={service}>{service}</Label>
              <Input
                id={service}
                type="password"
                value={apiKeys[service] || ''}
                onChange={(e) => handleInputChange(service, e.target.value)}
              />
            </div>
          );
        })}
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

export default ApiKeysSettings;
