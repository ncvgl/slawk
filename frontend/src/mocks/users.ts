export interface User {
  id: number;
  name: string;
  email: string;
  avatar: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  displayName?: string;
}

export const mockUsers: User[] = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@company.com',
    avatar: 'https://i.pravatar.cc/150?img=1',
    status: 'online',
    displayName: 'Alice',
  },
  {
    id: 2,
    name: 'Bob Smith',
    email: 'bob@company.com',
    avatar: 'https://i.pravatar.cc/150?img=2',
    status: 'away',
    displayName: 'Bob',
  },
  {
    id: 3,
    name: 'Charlie Davis',
    email: 'charlie@company.com',
    avatar: 'https://i.pravatar.cc/150?img=3',
    status: 'online',
  },
  {
    id: 4,
    name: 'Diana Martinez',
    email: 'diana@company.com',
    avatar: 'https://i.pravatar.cc/150?img=4',
    status: 'dnd',
  },
  {
    id: 5,
    name: 'Edward Brown',
    email: 'edward@company.com',
    avatar: 'https://i.pravatar.cc/150?img=5',
    status: 'online',
  },
  {
    id: 6,
    name: 'Fiona Wilson',
    email: 'fiona@company.com',
    avatar: 'https://i.pravatar.cc/150?img=6',
    status: 'offline',
  },
  {
    id: 7,
    name: 'George Taylor',
    email: 'george@company.com',
    avatar: 'https://i.pravatar.cc/150?img=7',
    status: 'online',
  },
  {
    id: 8,
    name: 'Hannah Anderson',
    email: 'hannah@company.com',
    avatar: 'https://i.pravatar.cc/150?img=8',
    status: 'away',
  },
  {
    id: 9,
    name: 'Ian Thomas',
    email: 'ian@company.com',
    avatar: 'https://i.pravatar.cc/150?img=9',
    status: 'online',
  },
  {
    id: 10,
    name: 'Julia Jackson',
    email: 'julia@company.com',
    avatar: 'https://i.pravatar.cc/150?img=10',
    status: 'online',
  },
  {
    id: 11,
    name: 'Kevin White',
    email: 'kevin@company.com',
    avatar: 'https://i.pravatar.cc/150?img=11',
    status: 'offline',
  },
  {
    id: 12,
    name: 'Laura Harris',
    email: 'laura@company.com',
    avatar: 'https://i.pravatar.cc/150?img=12',
    status: 'online',
  },
];

export const currentUser = mockUsers[0];
