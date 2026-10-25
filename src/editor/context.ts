import { createContext, useContext } from 'react';

// Class information that question editors inside the task editor can use.
export type EditorClass = { classmates: { id: string; name: string }[] };
export const EditorClassContext = createContext<EditorClass>({ classmates: [] });
export const useEditorClass = () => useContext(EditorClassContext);
