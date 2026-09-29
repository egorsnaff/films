// «Общий список» в профиле: объединённый «Буду смотреть» этих пользователей.
export type SharedListMember = {
  username: string;
  // Имя в дательном падеже для кнопок бота: «Добавить Ксении».
  dative: string;
};

export const SHARED_LIST_MEMBERS: SharedListMember[] = [
  { username: "egor", dative: "Егору" },
  { username: "kseniya", dative: "Ксении" }
];

export const SHARED_LIST_USERNAMES = SHARED_LIST_MEMBERS.map((member) => member.username);
