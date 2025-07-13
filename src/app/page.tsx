"use client";

import LZString from "lz-string";
import { useEffect, useState } from "react";

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  sourceFeedTitle?: string;
  image?: string;
};

const SAMPLE_FEEDS: { name: string; feeds: string[] }[] = [
  {
    name: "Tech News Bundle",
    feeds: [
      "https://hnrss.org/frontpage",
      "https://feeds.arstechnica.com/arstechnica/features",
      "https://www.theverge.com/rss/index.xml",
    ],
  },
  {
    name: "Development Blogs",
    feeds: [
      "https://overreacted.io/rss.xml",
      "https://jvns.ca/atom.xml",
      "https://kentcdodds.com/blog/rss.xml",
    ],
  },
  {
    name: "Design & UX",
    feeds: [
      "https://www.smashingmagazine.com/feed/",
      "https://alistapart.com/main/feed/",
      "https://www.nngroup.com/feed/rss/",
    ],
  },
];

export default function Home() {
  const [feedList, setFeedList] = useState<string>("");
  const [mergedUrl, setMergedUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [previewItems, setPreviewItems] = useState<FeedItem[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [existingUrl, setExistingUrl] = useState<string>("");
  // Update recentPermalinks to store objects with url and timestamp
  type PermalinkEntry = { url: string; timestamp: number };
  const [recentPermalinks, setRecentPermalinks] = useState<PermalinkEntry[]>([]);

  // Load recent permalinks from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("recentPermalinks");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Migrate from old format (array of strings)
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            setRecentPermalinks(parsed.map((url: string) => ({ url, timestamp: Date.now() })));
          } else {
            setRecentPermalinks(parsed);
          }
        } catch {
          setRecentPermalinks([]);
        }
      }
    }
  }, []);

  // Save a new permalink to localStorage and state
  const savePermalink = (url: string) => {
    setRecentPermalinks((prev) => {
      const now = Date.now();
      const filtered = prev.filter((entry) => entry.url !== url);
      const updated = [{ url, timestamp: now }, ...filtered].slice(0, 5);
      localStorage.setItem("recentPermalinks", JSON.stringify(updated));
      return updated;
    });
  };

  // Helper to format relative time
  function formatRelativeTime(timestamp: number) {
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000); // seconds
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  const getFeedsFromList = () => {
    return feedList
      .split("\n")
      .map((feed) => feed.trim())
      .filter((feed) => feed !== "");
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const loadExistingFeed = (url: string) => {
    try {
      const urlObj = new URL(url);
      const feedsParam = urlObj.searchParams.get("feeds");

      if (!feedsParam) {
        setErrorMessage("No feeds parameter found in URL");
        return;
      }

      const decompressed =
        LZString.decompressFromEncodedURIComponent(feedsParam);
      if (!decompressed) {
        setErrorMessage("Failed to decode feed data from URL");
        return;
      }

      const feeds = JSON.parse(decompressed);
      if (!Array.isArray(feeds)) {
        setErrorMessage("Invalid feed data format");
        return;
      }

      setFeedList(feeds.join("\n"));
      setExistingUrl("");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage("Invalid URL or failed to decode feed data");
    }
  };

  // This name is now a bit of a misnomer; this function also generates the core feed.
  const fetchPreview = async () => {
    const feeds = getFeedsFromList();
    const validFeeds = feeds.filter((feed) => isValidUrl(feed));
    if (validFeeds.length === 0) {
      setPreviewItems([]);
      return;
    }

    setIsLoadingPreview(true);
    try {
      // Compress feeds using LZ-string for better compression
      const feedsData = JSON.stringify(validFeeds);
      const compressedFeeds = LZString.compressToEncodedURIComponent(feedsData);

      const response = await fetch(`/api/merge?feeds=${compressedFeeds}`);
      if (!response.ok) {
        throw new Error("Failed to fetch preview");
      }

      const text = (await response.text()).replaceAll(
        "content:encoded",
        "content",
      );
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      console.log(xmlDoc);

      const items = Array.from(xmlDoc.querySelectorAll("item"))
        .slice(0, 25)
        .map((item) => {
          const getTextContent = (tagName: string) =>
            item.querySelector(tagName)?.textContent || undefined;

          return {
            title: getTextContent("title"),
            link: getTextContent("link"),
            pubDate: getTextContent("pubDate"),
            content: getTextContent("content"),
            sourceFeedTitle:
              item.querySelector("source")?.textContent || undefined,
            image:
              parser
                .parseFromString(getTextContent("encoded") || "", "text/html")
                .querySelector("img")
                ?.getAttribute("src") || undefined,
          };
        });

      setPreviewItems(items);
      const permalink = `${window.location.origin}/api/merge?feeds=${compressedFeeds}`;
      setMergedUrl(permalink);
      savePermalink(permalink);
    } catch (error) {
      console.error("Error fetching preview:", error);
      setPreviewItems([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    const feeds = getFeedsFromList();
    const validFeeds = feeds.filter((feed) => isValidUrl(feed));
    if (validFeeds.length > 0) {
      const timeoutId = setTimeout(() => {
        fetchPreview();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    setPreviewItems([]);
  }, [feedList]);

  return (
    <div className="min-h-screen bg-white font-sans p-0 text-[#111]">
      <div className="flex flex-col lg:flex-row">
        <div className="max-w-prose p-8 space-y-8">
          <div>
            <h1 className="text-4xl font-extrabold mb-2 leading-tight" style={{ color: 'var(--primary)' }}>
              rssrssrssrss (Val's Version)
            </h1>
            <p className="text-lg font-semibold mb-4" style={{ color: '#111' }}>Combine multiple RSS feeds into one unified feed</p>
          </div>

          <div className="p-6 rounded-xl border border-[#ececf6] shadow-sm" style={{ background: 'rgba(76,0,164,0.75)' }}>
            <h2 className="font-bold text-xl mb-2" style={{ color: '#fff' }}>Add your RSS feeds</h2>
            <div className="flex items-center justify-between mb-2">
              <p className="text-base mb-0" style={{ color: '#fff' }}>Enter one RSS feed URL per line</p>
              {feedList.trim() && (
                <button
                  type="button"
                  onClick={() => setFeedList("")}
                  className="ml-2 text-white underline text-sm font-medium bg-transparent border-none p-0 cursor-pointer hover:opacity-80"
                  style={{ textDecorationThickness: '2px' }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-4">
              <textarea
                value={feedList}
                onChange={(e) => {
                  setFeedList(e.target.value);
                  setErrorMessage("");
                }}
                className="w-full px-3 py-2 text-base border border-[#ececf6] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF5733] font-mono bg-white text-[#111]"
                rows={6}
                placeholder={`https://website1.com/rss\nhttps://website2.com/rss`}
              />
            </div>

            <div className="text-center text-sm flex items-center -mx-4 my-4" style={{ color: '#fff', opacity: 0.7 }}>
              <div className="flex-1 border-t border-[#ececf6] opacity-50" />
              <div className="flex justify-center px-4 text-xs uppercase font-semibold tracking-wider">Or</div>
              <div className="flex-1 border-t border-[#ececf6] opacity-50" />
            </div>

            <div>
              <h2 className="font-bold text-lg mb-2" style={{ color: '#fff' }}>Load existing merged feed</h2>
              <p className="text-base mb-2" style={{ color: '#fff' }}>Paste an existing merged feed URL to edit it</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={existingUrl}
                  onChange={(e) => {
                    setExistingUrl(e.target.value);
                    loadExistingFeed(e.target.value);
                  }}
                  placeholder="https://rssrssrssrss.com/api/merge?feeds=..."
                  className="flex-1 px-3 py-2 text-base border border-[#ececf6] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF5733] bg-white text-[#111]"
                />
              </div>
            </div>
          </div>

          {/* Recent Permalinks Section */}
          <div className="p-6 rounded-xl shadow-sm mt-6" style={{ background: '#f7f7fa', border: '2px solid #4c00a4' }}>
            <h2 className="font-bold text-xl mb-2" style={{ color: '#4c00a4' }}>Recent permalinks</h2>
            {recentPermalinks.length === 0 || recentPermalinks.every(e => !e.url) ? (
              <p className="text-base text-[#666]">Recently generated permalinks will appear here.</p>
            ) : (
              <ul className="space-y-2">
                {recentPermalinks.filter(e => e.url).map((entry) => (
                  <li key={entry.url} className="truncate flex items-center gap-2">
                    <span className="italic text-xs text-[#666]">({formatRelativeTime(entry.timestamp)})</span>
                    <a href={entry.url} target="_blank" rel="noopener noreferrer" className="link" style={{ color: '#4c00a4' }}>{entry.url}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="font-bold text-xl mb-2" style={{ color: 'var(--primary)' }}>How do I use this?</h2>
            <p className="text-base text-[#333]">Put the URLs of RSS feeds you want to combine in the box above; idly (or passionately) browse the preview to make sure it's what you want; hit the button to get a permalink (that's a base-64 encoded URL of the feeds, so no real worry about bitrot).</p>
          </div>

          <div>
            <h2 className="font-bold text-xl mb-2" style={{ color: 'var(--primary)' }}>Why would I want to do this?</h2>
            <p className="text-base text-[#333]">Lots of things take RSS. Relatively few things do a great job of interleaving multiple RSS feeds. This is a simple tool to do that.</p>
          </div>

          <div>
            <h2 className="font-bold text-xl mb-2" style={{ color: 'var(--primary)' }}>May I refer to it as rss<sup>4</sup>?</h2>
            <p className="text-base text-[#333]">If you insist.</p>
          </div>

          <div>
            <h2 className="font-bold text-xl mb-2" style={{ color: 'var(--primary)' }}>Who built this?</h2>
            <p className="text-base text-[#333]">
              Those legends over at{' '}
              <a
                href="https://buttondown.com?utm_source=rss4"
                className="link font-bold"
                style={{ color: 'var(--secondary)' }}
              >
                Buttondown
              </a>
              , and they even made it{' '}
              <a
                href="https://github.com/buttondown/rssrssrssrss"
                className="link font-bold"
                style={{ color: 'var(--primary)' }}
              >
                open source
              </a>
              .
            </p>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 border border-[#FF5733] rounded-md bg-[#fff0eb] text-[#FF5733]">
              <p>{errorMessage}</p>
            </div>
          )}
        </div>
        <div className="flex-1" />

        <div className="hidden lg:block">
          <div className="flex h-[calc(100vh)] overflow-y-hidden p-8 pb-0 sticky top-0">
            <div className="mx-auto shadow-2xl border border-neutral-300 rounded-md rounded-b-none bg-white w-[600px] overflow-y-scroll">
              {feedList.length > 0 && (
                <div className="grid grid-cols-3 p-2 pb-1 border-b border-neutral-300 shadow-sm sticky top-0 bg-white">
                  <div className="flex items-center">
                    {/* Every favicon, make a circle, 16px */}
                    {previewItems
                      .map((item) => item.link?.split("/")[2])
                      .filter(
                        (domain, index, self) => self.indexOf(domain) === index,
                      )
                      .map((domain, index) => (
                        <img
                          key={domain}
                          src={`https://s2.googleusercontent.com/s2/favicons?domain=${domain}`}
                          alt={domain}
                          className="w-4 h-4 -ml-2 first:ml-0 border border-neutral-300 rounded-full"
                          style={{ zIndex: index + 1 }}
                        />
                      ))}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 text-center">
                    Merged Feed
                  </h3>
                  <div className="text-right">
                    <a
                      href={mergedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 inline-flex items-center whitespace-nowrap font-semibold text-xs bg-blue-200 px-1.5 py-[2px] rounded-sm"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      Get permalink
                    </a>
                  </div>
                </div>
              )}

              {isLoadingPreview ? (
                <div className="space-y-0">
                  {[...Array(5)].map((_, index) => (
                    <div
                      key={index}
                      className="border border-gray-100 text-sm odd:bg-neutral-100/50 p-2 border-b border-b-neutral-300 animate-pulse"
                    >
                      <div className="h-5 bg-gray-300 rounded w-3/4 mb-2" />
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded" />
                        <div className="h-3 bg-gray-200 rounded w-5/6" />
                      </div>
                      <div className="flex justify-between mt-2">
                        <div className="flex items-center">
                          <div className="w-4 h-4 bg-gray-300 rounded mr-1" />
                          <div className="h-3 bg-gray-200 rounded w-24" />
                        </div>
                        <div className="h-3 bg-gray-200 rounded w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : previewItems.length > 0 ? (
                <div className="">
                  {previewItems.map((item, index) => (
                    <div
                      key={index}
                      className="border border-gray-100 text-sm odd:bg-neutral-50 p-2 max-w-full border-b border-b-neutral-300"
                    >
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-48 object-cover mb-2 rounded-md"
                        />
                      )}
                      <h4 className="font-semibold text-gray-900 truncate">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-blue-600"
                        >
                          {item.title || "«No Title Defined»"}
                        </a>
                      </h4>
                      <div className="flex-1">
                        {item.content && (
                          <p
                            className="text-sm text-gray-600 line-clamp-4 break-normal [&_img]:hidden [&_.separator]:hidden [&_br:first-of-type]:hidden"
                            dangerouslySetInnerHTML={{ __html: item.content }}
                          />
                        )}
                      </div>
                      <div className="flex justify-between mt-2 text-xs">
                        <div className="flex items-center">
                          <img
                            src={`https://s2.googleusercontent.com/s2/favicons?domain=${
                              item.link?.split("/")[2]
                            }`}
                            alt={item.title}
                            className="w-4 h-4 mr-1 rounded-md"
                          />
                          {item.sourceFeedTitle && (
                            <p className="text-gray-500">
                              {item.sourceFeedTitle}
                            </p>
                          )}
                        </div>
                        {item.pubDate && (
                          <p className="text-gray-500">
                            {new Date(item.pubDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-12 w-12 text-gray-400 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    No feeds added yet
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Add RSS feed URLs to see a preview of your merged feed
                  </p>

                  <div className="space-y-3 w-full">
                    <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">
                      Try a sample bundle:
                    </p>
                    {SAMPLE_FEEDS.map((bundle, index) => (
                      <button
                        key={index}
                        onClick={() => setFeedList(bundle.feeds.join("\n"))}
                        className="w-full px-4 py-3 text-sm text-left border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-semibold text-gray-800">
                          {bundle.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {bundle.feeds.length} feeds
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Preview Section - Shown only on small screens */}
        <div className="lg:hidden p-8 pt-0">
          <div className="mx-auto shadow-2xl border border-neutral-300 rounded-md bg-white max-h-96 overflow-y-scroll">
            {feedList.length > 0 && (
              <div className="grid grid-cols-3 p-2 pb-1 border-b border-neutral-300 shadow-sm sticky top-0 bg-white">
                <div className="flex items-center">
                  {/* Every favicon, make a circle, 16px */}
                  {previewItems
                    .map((item) => item.link?.split("/")[2])
                    .filter(
                      (domain, index, self) => self.indexOf(domain) === index,
                    )
                    .map((domain, index) => (
                      <img
                        key={domain}
                        src={`https://s2.googleusercontent.com/s2/favicons?domain=${domain}`}
                        alt={domain}
                        className="w-4 h-4 -ml-2 first:ml-0 border border-neutral-300 rounded-full"
                        style={{ zIndex: index + 1 }}
                      />
                    ))}
                </div>
                <h3 className="text-sm font-semibold text-gray-800 text-center">
                  Merged Feed
                </h3>
                <div className="text-right">
                  <a
                    href={mergedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 inline-flex items-center whitespace-nowrap font-semibold text-xs bg-blue-200 px-1.5 py-[2px] rounded-sm"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="size-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Get permalink
                  </a>
                </div>
              </div>
            )}

            {isLoadingPreview ? (
              <div className="space-y-0">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="border border-gray-100 text-sm odd:bg-neutral-100/50 p-2 border-b border-b-neutral-300 animate-pulse"
                  >
                    <div className="h-5 bg-gray-300 rounded w-3/4 mb-2" />
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded" />
                      <div className="h-3 bg-gray-200 rounded w-5/6" />
                    </div>
                    <div className="flex justify-between mt-2">
                      <div className="flex items-center">
                        <div className="w-4 h-4 bg-gray-300 rounded mr-1" />
                        <div className="h-3 bg-gray-200 rounded w-24" />
                      </div>
                      <div className="h-3 bg-gray-200 rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : previewItems.length > 0 ? (
              <div className="">
                {previewItems.map((item, index) => (
                  <div
                    key={index}
                    className="border border-gray-100 text-sm odd:bg-neutral-50 p-2 max-w-full border-b border-b-neutral-300"
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-48 object-cover mb-2 rounded-md"
                      />
                    )}
                    <h4 className="font-semibold text-gray-900 truncate">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-blue-600"
                      >
                        {item.title || "«No Title Defined»"}
                      </a>
                    </h4>
                    <div className="flex-1">
                      {item.content && (
                        <p
                          className="text-sm text-gray-600 line-clamp-4 break-normal"
                          dangerouslySetInnerHTML={{ __html: item.content }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between mt-2 text-xs">
                      <div className="flex items-center">
                        <img
                          src={`https://s2.googleusercontent.com/s2/favicons?domain=${
                            item.link?.split("/")[2]
                          }`}
                          alt={item.title}
                          className="w-4 h-4 mr-1 rounded-md"
                        />
                        {item.sourceFeedTitle && (
                          <p className="text-gray-500">
                            {item.sourceFeedTitle}
                          </p>
                        )}
                      </div>
                      {item.pubDate && (
                        <p className="text-gray-500">
                          {new Date(item.pubDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  No feeds added yet
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Add RSS feed URLs to see a preview of your merged feed
                </p>

                <div className="space-y-3 w-full">
                  <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">
                    Try a sample bundle:
                  </p>
                  {SAMPLE_FEEDS.map((bundle, index) => (
                    <button
                      key={index}
                      onClick={() => setFeedList(bundle.feeds.join("\n"))}
                      className="w-full px-4 py-3 text-sm text-left border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-semibold text-gray-800">
                        {bundle.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {bundle.feeds.length} feeds
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
