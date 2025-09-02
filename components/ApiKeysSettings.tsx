'use client';

import React, { useState } from 'react';
import { useApiKeys } from '@/contexts/ApiKeysContext';
import { ApiKeys } from '@/lib/api-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, Check, X, ExternalLink, Loader2 } from 'lucide-react';

interface ApiKeyInputProps {
  label: string;
  description: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onValidate: () => Promise<void>;
  isValidating: boolean;
  validationResult?: { isValid: boolean; error?: string };
  getApiUrl: string;
  required?: boolean;
}

function ApiKeyInput({
  label,
  description,
  placeholder,
  value,
  onChange,
  onValidate,
  isValidating,
  validationResult,
  getApiUrl,
  required = false
}: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={label.toLowerCase()} className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <a
          href={getApiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          Get API Key <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <p className="text-xs text-gray-600">{description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={label.toLowerCase()}
            type={showKey ? 'text' : 'password'}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Button
          onClick={onValidate}
          disabled={!value || isValidating}
          variant="outline"
          size="sm"
        >
          {isValidating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Validate'
          )}
        </Button>
      </div>
      {validationResult && (
        <div className="flex items-center gap-2 text-sm">
          {validationResult.isValid ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-green-600">Valid API key</span>
            </>
          ) : (
            <>
              <X className="w-4 h-4 text-red-600" />
              <span className="text-red-600">{validationResult.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ApiKeysSettingsProps {
  onClose?: () => void;
}

export function ApiKeysSettings({ onClose }: ApiKeysSettingsProps) {
  const { apiKeys, setApiKey, hasRequiredKeys, missingKeys, validateApiKey, isValidating } = useApiKeys();
  const [localKeys, setLocalKeys] = useState<ApiKeys>(apiKeys);
  const [validationResults, setValidationResults] = useState<Record<string, { isValid: boolean; error?: string }>>({});

  const handleKeyChange = (provider: keyof ApiKeys, value: string) => {
    setLocalKeys(prev => ({ ...prev, [provider]: value }));
    // Clear validation result when key changes
    setValidationResults(prev => {
      const updated = { ...prev };
      delete updated[provider];
      return updated;
    });
  };

  const handleValidateKey = async (provider: keyof ApiKeys) => {
    const key = localKeys[provider];
    if (!key) return;

    try {
      const result = await validateApiKey(provider, key);
      setValidationResults(prev => ({ ...prev, [provider]: result }));
      
      if (result.isValid) {
        setApiKey(provider, key);
      }
    } catch (error) {
      setValidationResults(prev => ({ 
        ...prev, 
        [provider]: { isValid: false, error: 'Validation failed' }
      }));
    }
  };

  const handleSaveAll = () => {
    // Save all keys that have values (validation is optional)
    Object.entries(localKeys).forEach(([provider, key]) => {
      if (key && key.trim()) {
        setApiKey(provider as keyof ApiKeys, key.trim());
      }
    });
    onClose?.();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>API Keys Configuration</CardTitle>
        <CardDescription>
          Configure your API keys to use Open Lovable. All keys are stored locally in your browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasRequiredKeys && (
          <Alert>
            <AlertDescription>
              Missing required API keys: {missingKeys.join(', ')}. 
              Please add these keys to use the application.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-3">Required API Keys</h3>
            <div className="space-y-4">
              <ApiKeyInput
                label="Groq API Key"
                description="For AI inference and code generation"
                placeholder="gsk_..."
                value={localKeys.groq || ''}
                onChange={(value) => handleKeyChange('groq', value)}
                onValidate={() => handleValidateKey('groq')}
                isValidating={isValidating}
                validationResult={validationResults.groq}
                getApiUrl="https://console.groq.com/keys"
                required
              />

              <ApiKeyInput
                label="E2B API Key"
                description="For code execution sandboxes"
                placeholder="e2b_..."
                value={localKeys.e2b || ''}
                onChange={(value) => handleKeyChange('e2b', value)}
                onValidate={() => handleValidateKey('e2b')}
                isValidating={isValidating}
                validationResult={validationResults.e2b}
                getApiUrl="https://e2b.dev/dashboard"
                required
              />


            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Optional API Keys</h3>
            <p className="text-sm text-gray-600 mb-3">
              Add these for additional AI model options
            </p>
            <div className="space-y-4">
              <ApiKeyInput
                label="Anthropic API Key"
                description="For Claude models"
                placeholder="sk-ant-..."
                value={localKeys.anthropic || ''}
                onChange={(value) => handleKeyChange('anthropic', value)}
                onValidate={() => handleValidateKey('anthropic')}
                isValidating={isValidating}
                validationResult={validationResults.anthropic}
                getApiUrl="https://console.anthropic.com/keys"
              />

              <ApiKeyInput
                label="OpenAI API Key"
                description="For GPT models"
                placeholder="sk-..."
                value={localKeys.openai || ''}
                onChange={(value) => handleKeyChange('openai', value)}
                onValidate={() => handleValidateKey('openai')}
                isValidating={isValidating}
                validationResult={validationResults.openai}
                getApiUrl="https://platform.openai.com/api-keys"
              />

              <ApiKeyInput
                label="Google Gemini API Key"
                description="For Gemini models"
                placeholder="AI..."
                value={localKeys.gemini || ''}
                onChange={(value) => handleKeyChange('gemini', value)}
                onValidate={() => handleValidateKey('gemini')}
                isValidating={isValidating}
                validationResult={validationResults.gemini}
                getApiUrl="https://aistudio.google.com/app/apikey"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <div className="flex items-center gap-2">
            {hasRequiredKeys && (
              <Badge variant="secondary" className="text-green-600">
                <Check className="w-3 h-3 mr-1" />
                Ready to use
              </Badge>
            )}
            <p className="text-sm text-gray-600">
              💡 Tip: Validation is optional. You can save keys and test them by creating a website.
            </p>
          </div>
          <div className="flex gap-2">
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSaveAll} className="bg-blue-600 hover:bg-blue-700">
              Save & Start Building
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
