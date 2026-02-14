import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface MenuItem {
    label: string;
    path?: string;
    visibleToAuthenticated: boolean;
    visibleToUnauthenticated: boolean;
}

export const MainMenu: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const { isAuthenticated, username, activeSeasons, signOut } = useAuth();

    const menuItems: MenuItem[] = [
        {
            label: 'Kudos',
            path: '/kudos',
            visibleToAuthenticated: true,
            visibleToUnauthenticated: false
        },
        {
            label: 'Kudos Standings',
            path: '/kudos-standings', 
            visibleToAuthenticated: true,
            visibleToUnauthenticated: false
        },
        {
            label: 'Tournaments & Clubs',
            path: '#',
            visibleToAuthenticated: true,
            visibleToUnauthenticated: true
        },
        {
            label: 'Forums',
            path: '#',
            visibleToAuthenticated: true,
            visibleToUnauthenticated: false
        }
    ];

    const toggleMenu = () => { setIsOpen(!isOpen); };

    const handleLogout = () => {
        setIsOpen(false);
        // Update auth state first - all protected pages will redirect to Login
        signOut();
        // Then override navigation to Home after auth state updates
        setTimeout(() => void navigate('/'), 0);
    };

    const hasActiveSeasons = activeSeasons.length > 0;
    const firstSeason = hasActiveSeasons ? activeSeasons[0] : null;
    const welcomeName = firstSeason?.person_name ?? username;

    return (
        <>
            {/* Hamburger Icon Button */}
            <button
                onClick={toggleMenu}
                className="p-2 text-main-text hover:text-action-accent focus:outline-none z-50 relative"
                aria-label="Toggle Menu"
                data-testid="main-menu-toggle"
            >
                <div className="space-y-1.5">
                    <span className={`block w-8 h-1 bg-current transition-transform duration-300 ${isOpen ? 'rotate-45 translate-y-2.5' : ''}`}></span>
                    <span className={`block w-8 h-1 bg-current transition-opacity duration-300 ${isOpen ? 'opacity-0' : ''}`}></span>
                    <span className={`block w-8 h-1 bg-current transition-transform duration-300 ${isOpen ? '-rotate-45 -translate-y-2.5' : ''}`}></span>
                </div>
            </button>

            {/* Menu Overlay */}
            <div
                data-testid="main-menu-overlay"
                className={`
                fixed inset-0 bg-primary-base z-40 flex flex-col items-center justify-center transition-opacity duration-300 ease-in-out
                ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
            `}
            >
                <nav className="w-full">
                    <ul className="flex flex-col space-y-6 text-center">
                        {!isAuthenticated ? (
                            <li>
                                <Link
                                    to="/login"
                                    className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2"
                                    onClick={toggleMenu}
                                    data-testid="main-menu-login-link"
                                >
                                    Log in
                                </Link>
                            </li>
                        ) : (
                            <li className="text-center">
                                <div className="text-red-600 mb-8" data-testid="main-menu-user-info">
                                    <div className="text-lg" data-testid="main-menu-welcome-message">
                                        Welcome, {welcomeName}
                                    </div>
                                    {firstSeason && (
                                        <div className="text-base mt-2" data-testid="main-menu-first-season">
                                            {firstSeason.league} {firstSeason.season} - {firstSeason.team_name}, {firstSeason.team_division}
                                        </div>
                                    )}
                                    {activeSeasons.slice(1).map((season, index) => (
                                        <div key={`${season.league}-${season.season}-${season.team_name}-${season.person_name}-${String(index)}`} className="text-base mt-1" data-testid="main-menu-additional-season">
                                            {season.league} {season.season} - {season.team_name}, {season.team_division}
                                            {(firstSeason?.person_name && season.person_name !== firstSeason.person_name) ? ` (${season.person_name})` : ''}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2 mx-auto"
                                    data-testid="main-menu-logout-button"
                                >
                                    Log out
                                </button>
                            </li>
                        )}
                        {menuItems.map((item) => {
                            const isVisible = isAuthenticated 
                                ? item.visibleToAuthenticated 
                                : item.visibleToUnauthenticated;
                            
                            if (!isVisible) return null;
                            
                            return (
                                <li key={item.label}>
                                    <Link
                                        to={item.path ?? '#'}
                                        className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2"
                                        onClick={toggleMenu}
                                        data-testid={`main-menu-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </div>
        </>
    );
};
