export type ImageRequest = {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
};

export type ImageResult = {
  mimeType: string;
  base64: string;
  provider: string;
  model: string;
};

export interface ImageProvider {
  readonly name: string;
  generate(request: ImageRequest): Promise<ImageResult>;
}
