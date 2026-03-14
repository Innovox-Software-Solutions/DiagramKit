"use client";

import React from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { LogIn, LogOut, User } from 'lucide-react';
import styles from './UserMenu.module.css';

export const UserMenu: React.FC = () => {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = React.useState(false);

    if (status === 'loading') {
        return null;
    }

    if (!session) {
        return (
            <button className={styles.signInButton} onClick={() => signIn('google')}>
                <LogIn size={18} />
                Sign In
            </button>
        );
    }

    return (
        <div className={styles.userMenu}>
            <button className={styles.userButton} onClick={() => setIsOpen(!isOpen)}>
                {session.user?.image ? (
                    <img src={session.user.image} alt="Profile" className={styles.avatar} />
                ) : (
                    <User size={20} />
                )}
            </button>
            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.userInfo}>
                        <div className={styles.userName}>{session.user?.name}</div>
                        <div className={styles.userEmail}>{session.user?.email}</div>
                    </div>
                    <button className={styles.signOutButton} onClick={() => signOut({ callbackUrl: '/' })}>
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
};
