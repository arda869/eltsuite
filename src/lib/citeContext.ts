import { createContext, useContext } from 'react';
import type { CiteStyle } from './cite';
export const CiteStyleContext = createContext<CiteStyle>('apa');
export const useCiteStyle = () => useContext(CiteStyleContext);
