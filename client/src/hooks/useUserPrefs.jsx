import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const UserPrefsContext = createContext({
  arabicNumerals: false,
  toggleArabicNumerals: () => {},
  theme: 'dark',
  setTheme: () => {},
});

export function UserPrefsProvider({ children }) {
  const [arabicNumerals, setArabicNumerals] = useState(() => {
    try {
      return localStorage.getItem('logiforce_arabic_numerals') === 'true';
    } catch {
      return false;
    }
  });

  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('logiforce_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleArabicNumerals = () => {
    setArabicNumerals((prev) => {
      const next = !prev;
      localStorage.setItem('logiforce_arabic_numerals', String(next));
      return next;
    });
  };

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem('logiforce_theme', t);
  };

  const value = useMemo(
    () => ({ arabicNumerals, toggleArabicNumerals, theme, setTheme }),
    [arabicNumerals, theme]
  );

  return (
    <UserPrefsContext.Provider value={value}>
      {children}
    </UserPrefsContext.Provider>
  );
}

export function useUserPrefs() {
  return useContext(UserPrefsContext);
}
