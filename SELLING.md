# Selling Matra

Two questions come up immediately, and both have honest answers that are more
useful than optimistic ones.

## "What stops a customer sharing it?"

Nothing does, completely. That is true of every source-available library ever
sold, including the ones this competes with. A customer who can install a
package can copy its files. Anyone claiming otherwise is selling obfuscation,
which buys an afternoon.

What is actually being sold is not secrecy:

- **The legal right to use it in production.** This is the real product.
- **Updates**, which a copy stops receiving the moment it is taken.
- **Support**, which a copy never had.

That matters because of who buys. A company with a legal department will not
risk an unlicensed dependency in its build to avoid $99 a month — the exposure
is thousands of times the saving, and it surfaces in every acquisition due
diligence and enterprise security review. Individuals might copy it, and
individuals were never going to pay: the licence already gives them the package
free for personal projects and small teams.

### What you can actually see

Less than any of the access-control schemes promised, and it does not matter as
much as it seems to.

- **npm download counts**, which say nothing about who.
- **Who asked you for an invoice**, which is the only signal that ever mattered.

Three gating designs were built and thrown away here before someone asked what
they were protecting. The source is in a public repository: anyone can read it,
clone it and build it without an account. A private registry in front of that is
a locked door in an open field, and it costs an organisation to administer,
collaborators to add and remove, and a second repository to keep in step.

### What not to do

Do not add a runtime licence check. It is trivially patched out, it breaks
customers at the worst possible moment, and it contradicts the promise the
licence makes — that a lapsed subscription cannot switch off software already
shipped. That promise is worth more than the piracy it fails to prevent.

## "How do I get paid?"

Stripe does not onboard Bangladesh-registered businesses, so the obvious answer
is unavailable. Check the current country list before planning around this; it
changes.

**Start here, because it costs nothing and works today:**

- **Invoice and bank transfer.** For $99–$349 a month, business to business,
  this is entirely normal — companies pay dozens of vendors this way and their
  finance teams prefer it. Wise or Payoneer receives the payment; both work for
  Bangladesh.

**Move here when volume justifies the fee:**

- **A merchant of record** — Paddle, Lemon Squeezy, Polar, FastSpring. They
  take roughly 5%, and in exchange they become the seller of record and handle
  VAT, sales tax and invoicing worldwide. That is not a convenience: charging
  EU customers means EU VAT obligations, and a merchant of record makes them
  someone else's problem entirely.
- Confirm each supports payouts to Bangladesh before building a checkout on it.

**Before any of it:** Bangladesh treats software export income differently to
ordinary income, and receiving foreign currency through the right banking
channel is usually a condition of that treatment. Talk to an accountant who has
handled a software exporter before you take the first payment, not after. That
sentence is the extent of my competence here.

## What to build first

Not a checkout. A checkout for zero customers is a way to avoid selling to the
first one. Put "talk to us" on the page, answer the email yourself, send an
invoice, and add self-serve when doing it by hand becomes the bottleneck.
