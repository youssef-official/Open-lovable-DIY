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
        size="default"
        className={`flex items-center gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold min-w-[120px] sm:min-w-[140px] backdrop-blur-sm border-white/20 ${
          hasRequiredKeys
            ? 'bg-white/10 text-white hover:bg-white/20 border-white/30'
            : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700 border-transparent shadow-lg'
        } transition-all duration-300 hover:scale-105 hover:shadow-xl ${className}`}
      >
        <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
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
