"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react"; // <-- 1. IMPORT THIS

interface UserHeaderProps {
  userName?: string;
  userEmail?: string;
}

export default function UserHeader({
  userName = "Admin User",
  userEmail = "admin@ebright.com"
}: UserHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- 2. UPDATED LOGOUT LOGIC ---
  const handleLogout = async () => {
    // This clears the NextAuth cookie and redirects to /login
    await signOut({ 
      callbackUrl: "/login",
      redirect: true 
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Profile Button */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors"
      >
        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
          {userName.split(" ").map((n) => n[0]).join("")}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-sm font-semibold text-white">{userName}</p>
        </div>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {/* User Info */}
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900">{userName}</p>
            <p className="text-xs text-gray-500 mt-1">{userEmail}</p>
          </div>

          {/* Menu Items */}
          <div className="py-2 text-slate-700"> {/* Added text color for visibility */}
            <Link
              href="/home"
              className="block px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              onClick={() => setDropdownOpen(false)}
            >
              🏠 Home
            </Link>
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
              onClick={() => setDropdownOpen(false)}
            >
              👤 My Profile
            </Link>
            
          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 p-2">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors flex items-center gap-2 font-bold"
            >
              🚪 Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}