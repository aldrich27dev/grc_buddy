export const INTERESTS_MAP = {
  BSIT: ['Programming', 'Cybersecurity', 'Web Dev', 'Gaming', 'AI & Tech'],
  BSBA: ['Marketing', 'Management', 'Stocks', 'Business Trends'],
  'BS Entrepreneurship': ['Startups', 'Innovation', 'E-commerce', 'Pitching Ideas'],
  'BS Accountancy': ['Taxation', 'Auditing', 'Bookkeeping', 'Financial Analysis'],
  'BS Education': ['Teaching Tips', 'Lesson Planning', 'Literature', 'Psychology'],
  General: ['Music', 'Movies', 'Love Advice', 'Study Buddy', 'Random Chat'],
};

export const COURSES = Object.keys(INTERESTS_MAP).filter((key) => key !== 'General');

export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export const LOCATIONS = [
  'Caloocan City',
  'Malabon City',
  'Navotas City',
  'Valenzuela City',
  'Quezon City',
  'Manila',
  'Bulacan',
  'Prefer not to say',
];

export const GENERAL_INTERESTS = INTERESTS_MAP.General;

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 5;

export const MAX_NAME_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 1000;

export function getAvailableInterests(course) {
  return [...(INTERESTS_MAP[course] || []), ...GENERAL_INTERESTS];
}