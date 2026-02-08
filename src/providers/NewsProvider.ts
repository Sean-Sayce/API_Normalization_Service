import type { Story } from "../types.js";

// Story query parameters
export type ListStoriesParams = {
  limit: number;
  minScore?: number;
};

// Provider result shape
export type ListStoriesResult = {
  items: Story[];
  droppedCount: number;
};

// Provider interface contract
export interface NewsProvider {
  // Fetch normalized stories
  listStories(params: ListStoriesParams): Promise<ListStoriesResult>;
}
