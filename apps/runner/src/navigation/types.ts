export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  Home: undefined;
  Earnings: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  ErrandDetail: { errandId: string };
  Verification: undefined;
  Chat: { errandId: string };
  Support: undefined;
  SupportNew: undefined;
  SupportThread: { ticketId: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
