export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  ErrandDetail: { errandId: string };
  Verification: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
