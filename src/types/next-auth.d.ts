import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      phone?: string;
      avatarUrl: string;
      needsOnboarding?: boolean;
    };
  }

  interface User {
    id: string;
    name: string;
    phone?: string;
    avatarUrl?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    phone: string;
    avatarUrl?: string;
    needsOnboarding?: boolean;
  }
}
