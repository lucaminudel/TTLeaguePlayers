import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const MainMenu: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { isAuthenticated, username, signOut } = useAuth();

    const menuItems = [
        'Kudos standings',
        'Forum',
        'Tournaments',
        'Clubs'
    ];

    const toggleMenu = () => { setIsOpen(!isOpen); };

    const handleLogout = () => {
        signOut();
        setIsOpen(false);
    };

    return (
        <>
            {/* Hamburger Icon Button */}
            <button
                onClick={toggleMenu}
                className="p-2 text-main-text hover:text-action-accent focus:outline-none z-50 relative"
                aria-label="Toggle Menu"
            >
                <div className="space-y-1.5">
                    <span className={`block w-8 h-1 bg-current transition-transform duration-300 ${isOpen ? 'rotate-45 translate-y-2.5' : ''}`}></span>
                    <span className={`block w-8 h-1 bg-current transition-opacity duration-300 ${isOpen ? 'opacity-0' : ''}`}></span>
                    <span className={`block w-8 h-1 bg-current transition-transform duration-300 ${isOpen ? '-rotate-45 -translate-y-2.5' : ''}`}></span>
                </div>
            </button>

            {/* Menu Overlay */}
            <div className={`
                fixed inset-0 bg-primary-base z-40 flex flex-col items-center justify-center transition-opacity duration-300 ease-in-out
                ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
            `}>
                <nav className="w-full">
                    <ul className="flex flex-col space-y-6 text-center">
                        {!isAuthenticated ? (
                            <li>
                                <Link
                                    to="/login"
                                    className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2"
                                    onClick={toggleMenu}
                                >
                                    Log in
                                </Link>
                            </li>
                        ) : (
                            <li className="text-center">
                                <div className="text-2xl text-red-600 mb-8">
                                    Welcome, {username}
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2 mx-auto"
                                >
                                    Log out
                                </button>
                            </li>
                        )}
                        {menuItems.map((item) => (
                            <li key={item}>
                                <a
                                    href="#"
                                    className="text-2xl font-bold text-main-text hover:text-action-accent transition-colors block py-2"
                                    onClick={toggleMenu}
                                >
                                    {item}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </>
    );
};
