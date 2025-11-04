'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
      <div className="flex justify-around items-center h-16">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            isActive('/') && !pathname.includes('/samples') && !pathname.includes('/share')
              ? 'text-blue-500'
              : 'text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
          <span className="text-xs font-medium">Record</span>
        </Link>

        <Link
          href="/samples"
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            isActive('/samples') ? 'text-blue-500' : 'text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          </svg>
          <span className="text-xs font-medium">Samples</span>
        </Link>

        <Link
          href="/share"
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            isActive('/share') ? 'text-blue-500' : 'text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="text-xs font-medium">Share</span>
        </Link>
      </div>
    </nav>
  );
}
