#!/usr/bin/env node
/**
 * Tell Bing the site changed, instead of waiting to be crawled.
 *
 * A sitemap is a thing a crawler reads when it next visits. On a domain
 * registered two days ago with no inbound links, "next visit" is not a date
 * anyone can predict — the crawler has no reason to come. IndexNow inverts
 * that: the site pushes its URL list and Bing fetches within minutes.
 *
 * Bing is the one worth pushing to. It backs ChatGPT search and Copilot, so
 * an assistant asked about Matra is querying an index this script can reach.
 * Google does not participate in IndexNow and never has; nothing here is a
 * substitute for submitting the sitemap in Search Console.
 *
 * The URL list comes from the deployed sitemap rather than from the source
 * tree, which makes this checkable rather than hopeful: if the deploy has not
 * landed, the sitemap fetched is the old one and the script says so instead of
 * announcing URLs that 404.
 */
const KEY = '55abfcfd652bcc8bad022e4d33381a22'
const HOST = 'matrajs.com'
const ORIGIN = `https://${HOST}`

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// The key has to be fetchable at the root before the submission is accepted;
// Bing verifies ownership by reading it back. Checking it here turns a silent
// rejection into a sentence.
const keyFile = await fetch(`${ORIGIN}/${KEY}.txt`)
if (!keyFile.ok) fail(`key file is not live: ${ORIGIN}/${KEY}.txt returned ${keyFile.status}`)
if ((await keyFile.text()).trim() !== KEY)
  fail(`key file at ${ORIGIN}/${KEY}.txt holds the wrong key`)

const sitemap = await fetch(`${ORIGIN}/sitemap.xml`)
if (!sitemap.ok) fail(`sitemap fetch failed: ${sitemap.status}`)

const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc)
if (urls.length === 0) fail('sitemap parsed to zero URLs')

// api.indexnow.org fans the submission out to every participating engine, so
// one POST covers Bing, Yandex, Seznam and Naver. 200 and 202 both mean
// accepted — 202 is "received, key not verified yet" and is normal on a first
// run, not an error to retry.
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `${ORIGIN}/${KEY}.txt`,
    urlList: urls,
  }),
})

if (!response.ok)
  fail(`IndexNow rejected the submission: ${response.status} ${await response.text()}`)
console.log(`submitted ${urls.length} URLs to IndexNow (${response.status})`)
