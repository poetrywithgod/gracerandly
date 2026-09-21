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
  CreateErrand: { errandId?: string } | undefined;
  ErrandDetail: { errandId: string };
  ErrandTracking: { errandId: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
