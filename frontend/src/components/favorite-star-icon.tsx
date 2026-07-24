import { Star } from "pixelarticons/react";

const filledFavoriteStarPath =
  "M11 1H13V3H15V7H23V11H21V13H19V16H21V22H16V20H14V18H10V20H8V22H3V16H5V13H3V11H1V7H9V3H11V1Z";

interface FavoriteStarIconProps {
  readonly filled: boolean;
}

export const FavoriteStarIcon = ({ filled }: FavoriteStarIconProps) =>
  filled ? (
    <svg
      aria-hidden="true"
      className="size-[24px] overflow-visible text-[var(--color-class-adjustment-ink)]"
      data-favorite-star-icon=""
      data-state="filled"
      fill="currentColor"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={filledFavoriteStarPath} />
    </svg>
  ) : (
    <Star
      aria-hidden="true"
      className="size-[24px] overflow-visible"
      data-favorite-star-icon=""
      data-state="unfilled"
    />
  );
