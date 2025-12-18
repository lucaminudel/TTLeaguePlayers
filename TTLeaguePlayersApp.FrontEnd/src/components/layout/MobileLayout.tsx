import React from 'react';
import { MainMenu } from '../navigation/MainMenu';

interface MobileLayoutProps {
    children: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({ children }) => {
    return (
        <div className="min-h-screen flex flex-col items-center p-4 max-w-md mx-auto relative bg-primary-base text-main-text">
            {/* App Name Header */}
            {/* App Name Header */}
            <header className="w-full py-6 flex items-center justify-center relative px-4">
                <h1 className="text-xl font-bold tracking-wider uppercase text-main-text opacity-90 mx-auto">
                    TT League Players
                </h1>
                <div className="absolute right-4 flex items-center">
                    <MainMenu />
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 w-full flex flex-col">
                {children}
            </main>
        </div>
    );
};
