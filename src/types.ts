// Normalized story model
export type Story = {
  id: number;
  title: string;
  url: string | null;
  author: string;
  score: number;
  commentCount: number;
  createdAt: string | null;
  source: string | null;
};
