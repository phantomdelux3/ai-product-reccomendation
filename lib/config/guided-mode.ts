export const RECIPIENTS = [
    'Boyfriend',
    'Girlfriend',
    'Mom',
    'Dad',
    'Friend',
    'Colleague'
];

export const AESTHETIC_OPTIONS = [
    'Classy',
    'Luxury',
    'Minimalist',
    'Boho',
    'Vintage',
    'Modern',
    'Quirky',
    'Romantic'
];

export const BUDGET_OPTIONS = [
    'Under 1k',
    '2k',
    '2.5k',
    '3k',
    '5k',
    '6k',
    '6k+'
];

export const COLLECTION_MAP: Record<string, string> = {
    'boyfriend': 'boyfriends',
    'girlfriend': 'girlfriends',
    'mom': 'mom',
    'dad': 'dad',
    'friend': 'friend',
    'colleague': 'colleague'
};

export const VIBE_MAP: Record<string, string[]> = {
    'boyfriend': ['Tech', 'Gaming', 'Grooming', 'Fashion', 'Fitness', 'Romantic', 'Food & Drink', 'Wellness', 'Travel', 'Music', 'General'],
    'girlfriend': ['Jewelry', 'Beauty', 'Fashion', 'Home Decor', 'Cute', 'Romantic', 'Wellness', 'Food & Drink', 'Travel', 'Art', 'Books', 'Stationery', 'General'],
    'mom': ['Home Decor', 'Kitchen', 'Wellness', 'Gardening', 'Fashion', 'Sentimental', 'Food & Drink', 'Travel', 'Books', 'Art', 'Stationery', 'General'],
    'dad': ['Tech', 'Tools', 'Grooming', 'Food & Drink', 'Office', 'Wellness', 'Travel', 'Sports', 'Music', 'General'],
    'friend': ['Funny', 'Games', 'Decor', 'Stationery', 'Tech', 'Snacks', 'Food & Drink', 'Wellness', 'Travel', 'Music', 'Books', 'General'],
    'colleague': ['Office', 'Stationery', 'Tech', 'Coffee/Tea', 'Professional', 'Food & Drink', 'Wellness', 'Travel', 'Books', 'General']
};

export const COLLECTIONS = Object.values(COLLECTION_MAP);
