import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SessionTimeoutContextType {
  showSessionTimeout: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(undefined);

export const useSessionTimeout = () => {
  const context = useContext(SessionTimeoutContext);
  if (!context) {
    throw new Error('useSessionTimeout must be used within a SessionTimeoutProvider');
  }
  return context;
};

// Global reference to showSessionTimeout function
let globalShowSessionTimeout: (() => void) | null = null;

export const setGlobalSessionTimeoutHandler = (handler: () => void) => {
  globalShowSessionTimeout = handler;
};

export const triggerSessionTimeout = () => {
  if (globalShowSessionTimeout) {
    globalShowSessionTimeout();
  }
};

interface SessionTimeoutProviderProps {
  children: ReactNode;
}

export const SessionTimeoutProvider: React.FC<SessionTimeoutProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const showSessionTimeout = useCallback(() => {
    setIsOpen(true);
  }, []);

  useEffect(() => {
    setGlobalSessionTimeoutHandler(showSessionTimeout);
    return () => {
      setGlobalSessionTimeoutHandler(() => {});
    };
  }, [showSessionTimeout]);

  const handleReLogin = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('businessId');
    setIsOpen(false);
    navigate('/login');
  }, [navigate]);

  return (
    <SessionTimeoutContext.Provider value={{ showSessionTimeout }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session Timeout</AlertDialogTitle>
            <AlertDialogDescription>
              Your session has timed out. Please re-login to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleReLogin}>
              Re-login
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SessionTimeoutContext.Provider>
  );
};
