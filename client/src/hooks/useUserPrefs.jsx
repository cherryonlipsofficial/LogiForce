import { createContext, useContext, useState, useMemo } from 'react';

const UserPrefsContext = createContext({
  arabicNumerals: false,
  toggleArabicNumerals: () => {},
});

export function UserPrefsProvider({ children }) {
  const [arabicNumerals, setArabicNumerals] = useState(() => {
    try {
      return localStorage.getItem('logiforce_arabic_numerals') === 'true';
    } catch {
      return false;
    }
  });

  const toggleArabicNumerals = () => {
    setArabicNumerals((prev) => {
      const next = !prev;
      localStorage.setItem('logiforce_arabic_numerals', String(next));
      return next;
    });
  };

  const value = useMemo(
    () => ({ arabicNumerals, toggleArabicNumerals }),
    [arabicNumerals]
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
