'use client';

import { useSession, signIn, signOut } from "next-auth/react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Settings, User, LogOut, LogIn, Shield } from "lucide-react"
import { ApiKeysModal } from "@/components/ApiKeysModal"
import Link from "next/link"

interface UserButtonProps {
  className?: string;
}

export function UserButton({ className = '' }: UserButtonProps) {
  const { data: session, status } = useSession()
  const [isApiKeysModalOpen, setIsApiKeysModalOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Check if user is admin
  const isAdmin = session?.user?.email === 'zainulabedeen0002@gmail.com'

  if (status === "loading") {
    return (
      <Button
        disabled
        size="default"
        className={`flex items-center gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold min-w-[120px] sm:min-w-[140px] backdrop-blur-sm border-white/20 bg-white/10 text-white border-white/30 transition-all duration-300 ${className}`}
      >
        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        Loading...
      </Button>
    )
  }

  if (!session) {
    return (
      <Button
        onClick={() => signIn('google')}
        size="default"
        className={`flex items-center gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold min-w-[120px] sm:min-w-[140px] backdrop-blur-sm border-white/20 bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700 border-transparent shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl ${className}`}
      >
        <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
        Sign In
      </Button>
    )
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        size="default"
        className={`flex items-center gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold min-w-[120px] sm:min-w-[140px] backdrop-blur-sm border-white/20 bg-white/10 text-white hover:bg-white/20 border-white/30 transition-all duration-300 hover:scale-105 hover:shadow-xl ${className}`}
      >
        {session.user?.image ? (
          <img 
            src={session.user.image} 
            alt={session.user.name || 'User'} 
            className="w-4 h-4 sm:w-5 sm:h-5 rounded-full"
          />
        ) : (
          <User className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
        <span className="truncate max-w-[100px]">
          {session.user?.name?.split(' ')[0] || 'User'}
        </span>
      </Button>

      {isDropdownOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsDropdownOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-white/95 backdrop-blur-lg rounded-lg shadow-xl border border-white/20 z-50 overflow-hidden">
            {/* User info */}
            <div className="p-4 border-b border-gray-200/20">
              <div className="flex items-center gap-3">
                {session.user?.image ? (
                  <img 
                    src={session.user.image} 
                    alt={session.user.name || 'User'} 
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {session.user?.name || 'User'}
                  </p>
                  <p className="text-xs text-gray-600 truncate">
                    {session.user?.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-2">
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsDropdownOpen(false)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100/50 flex items-center gap-3 transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  Admin Dashboard
                </Link>
              )}

              <button
                onClick={() => {
                  setIsApiKeysModalOpen(true)
                  setIsDropdownOpen(false)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100/50 flex items-center gap-3 transition-colors"
              >
                <Settings className="w-4 h-4" />
                API Keys Settings
              </button>
              
              <button
                onClick={() => {
                  signOut()
                  setIsDropdownOpen(false)
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50/50 flex items-center gap-3 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* API Keys Modal */}
      <ApiKeysModal 
        isOpen={isApiKeysModalOpen} 
        onClose={() => setIsApiKeysModalOpen(false)} 
      />
    </div>
  )
}
