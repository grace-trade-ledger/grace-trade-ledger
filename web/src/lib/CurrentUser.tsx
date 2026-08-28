import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface AppUser { id: string; name: string; email: string; companyId: string | null; roleId: string; }

interface Ctx { users: AppUser[]; currentUserId: string; setCurrentUserId: (id: string) => void; currentUser: AppUser | undefined; }
const CurrentUserCtx = createContext<Ctx | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    api.get<AppUser[]>("/api/users").then((rows) => {
      setUsers(rows);
      if (rows.length) setCurrentUserId(rows[0].id);
    });
  }, []);

  return (
    <CurrentUserCtx.Provider value={{ users, currentUserId, setCurrentUserId, currentUser: users.find((u) => u.id === currentUserId) }}>
      {children}
    </CurrentUserCtx.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserCtx);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
