/**
 * תאימות לאחור: כניסה ל־/drivers/:id מפנה לפרטי נהג (עריכה מאוחדת).
 * פרמטר query לסקשן — ניווט ישיר לעריכת משבצת.
 */
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { DriverSectionId } from '@/lib/driverFieldMap';
import { DRIVER_SECTION_QUERY_PARAM } from '@/lib/driverFieldMap';

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const sectionParam = searchParams.get(DRIVER_SECTION_QUERY_PARAM) as DriverSectionId | null;
  const validSections: string[] = ['personal', 'organizational', 'licenses', 'safety'];
  if (id && sectionParam && validSections.includes(sectionParam)) {
    return <Navigate to={`/drivers/${id}/section/${sectionParam}`} replace />;
  }

  if (!id) return <Navigate to="/drivers" replace />;
  return <Navigate to={`/drivers/${id}/edit`} replace />;
}
