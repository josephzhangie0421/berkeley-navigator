import { Icon } from "@/components/ui/Icon";
import { isProfileEmpty, type StudentProfile } from "@/lib/types/profile";

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">
        {values.length ? values.join(", ") : <span className="text-muted/80">Not set</span>}
      </dd>
    </div>
  );
}

export function ProfileSummary({ profile, onEdit }: { profile: StudentProfile; onEdit: () => void }) {
  return (
    <section aria-labelledby="profile-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 id="profile-heading" className="font-serif text-base text-ink">
          Your profile
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-sm text-ink hover:bg-ink-soft"
        >
          <Icon name="edit" className="size-3.5" />
          Edit
        </button>
      </div>
      {isProfileEmpty(profile) ? (
        <p className="mt-2 text-sm text-muted">
          No profile yet. Adding your year, major and completed courses helps tailor answers.
        </p>
      ) : (
        <dl className="mt-3 space-y-2.5">
          <Row label="Year" values={profile.academic_year ? [profile.academic_year] : []} />
          <Row label="Major" values={profile.majors} />
          <Row label="Completed" values={profile.completed_courses} />
          <Row label="Interests" values={profile.interests} />
          {profile.constraints.length > 0 && <Row label="Constraints" values={profile.constraints} />}
        </dl>
      )}
    </section>
  );
}

/** One-line version for small screens. */
export function ProfileStrip({ profile, onEdit }: { profile: StudentProfile; onEdit: () => void }) {
  const parts = [profile.academic_year, ...profile.majors].filter(Boolean);
  const courses = profile.completed_courses.length;
  const text = isProfileEmpty(profile)
    ? "No profile yet"
    : `${parts.join(", ") || "Profile"}${courses ? `, ${courses} course${courses === 1 ? "" : "s"} completed` : ""}`;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden">
      <p className="truncate text-sm text-muted">
        <span className="text-text">Profile:</span> {text}
      </p>
      <button type="button" onClick={onEdit} className="shrink-0 rounded px-2 py-1 text-sm font-medium text-ink hover:bg-ink-soft">
        {isProfileEmpty(profile) ? "Add" : "Edit"}
      </button>
    </div>
  );
}
