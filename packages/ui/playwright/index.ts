export interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  type: "story" | "docs";
}

interface StoryIndex {
  entries: Record<string, StoryIndexEntry>;
}

export const loadStoryIndex = async (
  baseURL: string,
): Promise<StoryIndexEntry[]> => {
  const response = await fetch(`${baseURL}/index.json`);

  if (!response.ok) {
    throw new Error(
      `Storybook index not reachable at ${baseURL}/index.json (${response.status})`,
    );
  }

  const index = (await response.json()) as StoryIndex;

  return Object.values(index.entries).sort((a, b) => a.id.localeCompare(b.id));
};
