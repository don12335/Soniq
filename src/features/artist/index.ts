// pages are lazy-loaded from app/routes.tsx; re-exporting them here would pull
// them back into the startup bundle
export { default as ArtistPageSkeleton } from "./ui/ArtistPageSkeleton";
export { default as ArtistLink, type ArtistLinkProps } from "./ui/ArtistLink";
