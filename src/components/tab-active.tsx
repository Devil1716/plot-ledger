"use client";

import { createContext, useContext } from "react";

/** True for the tab the user is looking at (neighbours stay mounted off-screen for swiping). */
export const TabActiveContext = createContext(true);
export const useTabActive = () => useContext(TabActiveContext);
