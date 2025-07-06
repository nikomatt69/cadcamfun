import { useState, useEffect } from 'react';

interface OrganizationStats {
  memberCount: number;
  projectCount: number;
}

export const useOrganizationStats = (organizationId: string) => {
  const [stats, setStats] = useState<OrganizationStats>({ memberCount: 0, projectCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch members and projects in parallel
        const [membersResponse, projectsResponse] = await Promise.all([
          fetch(`/api/organizations/${organizationId}/members`),
          fetch(`/api/organizations/${organizationId}/projects`)
        ]);

        if (!membersResponse.ok || !projectsResponse.ok) {
          throw new Error('Failed to fetch organization statistics');
        }

        const [members, projects] = await Promise.all([
          membersResponse.json(),
          projectsResponse.json()
        ]);

        setStats({
          memberCount: Array.isArray(members) ? members.length : 0,
          projectCount: Array.isArray(projects) ? projects.length : 0
        });
      } catch (err) {
        console.error('Error fetching organization stats:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [organizationId]);

  return { stats, isLoading, error };
}; 