export type TimelineMeal = { id: string; name: string; date_start: string; date_end: string; status: string; deadline_at: string; host_id: string; memberships?: Array<{user_id: string; status: string}>; availability_submissions?: Array<{user_id: string}> };
export function timelineMeals(meals: TimelineMeal[], view: 'upcoming' | 'history' | 'hosting', userId: string | null, today: string) {
  return meals.filter(meal => {
    const past = meal.date_end < today || meal.status === 'cancelled';
    if (view === 'history') return past;
    if (view === 'hosting') return meal.host_id === userId && !past;
    return !past && meal.status !== 'draft';
  }).sort((a,b) => (view === 'history' ? b.date_start.localeCompare(a.date_start) : a.date_start.localeCompare(b.date_start)) || a.name.localeCompare(b.name));
}
