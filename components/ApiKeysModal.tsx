'use client';

import React, { useState } from 'react';
import { useApiKeys } from '@/contexts/ApiKeysContext';
import { ApiKeysSettings } from '@/components/ApiKeysSettings';
import { Button } from '@/components/ui/button';
import { X, Settings } from 'lucide-react';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeysModal({ isOpen, onClose }: ApiKeysModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">API Keys Configuration</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <ApiKeysSettings onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

interface ApiKeysButtonProps {
  className?: string;
}

export function ApiKeysButton({ className = '' }: ApiKeysButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { hasRequiredKeys, missingKeys } = useApiKeys();

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        variant={hasRequiredKeys ? "outline" : "default"}
        size="sm"
        className={`flex items-center gap-2 ${className}`}
      >
        <Settings className="w-4 h-4" />
        {hasRequiredKeys ? (
          'API Keys'
        ) : (
          `Setup API Keys (${missingKeys.length} missing)`
        )}
      </Button>
      
      <ApiKeysModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
