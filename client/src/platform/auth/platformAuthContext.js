import { createContext, useContext } from 'react';

// Platform staff session. Separate from the company AuthContext
// (context/AuthContext.jsx): different token, different user, different API.
export const PlatformAuthContext = createContext(null);

export const usePlatformAuth = () => useContext(PlatformAuthContext);
