# Local synthetic acceptance

This route exercises the production `ImportPanel` using a local transport. No Nebius request, live extraction, hosted privacy acceptance, friend submission or real-device speech is represented by this test.

## Run

1. Run `npm run dev`, open `/preview`, and select **390px mobile** or **Desktop**. The inner canvas has its own viewport, so CSS breakpoints actually change. This is browser viewport testing, not an iPhone test.
2. Open **Acceptance controls**. Reset only the local sample, then **Load three sample cards**.
3. Skip `交研究報告`. Enter `19:00-20:30` for `和 Maya 吃晚餐`, confirm the answer, confirm busy, and skip `買火車票`.
4. Preview the three changes. Use **Back / refresh preview** to cancel: the grid must remain unchanged. Preview again and save: only October 3 at 19:00, 19:30 and 20:00 become busy.
5. Refresh the page: saved cells and intermediate confirmed/skipped item progress survive. Reset removes only `allvailable.synthetic-import.v1`.

## Additional scenarios

- **Retry:** select Fail next action before loading or answering. Error text appears, typed answers remain, and retry completes the same operation. No duplicate rows appear.
- **All skipped:** skip every card. The page reports that the grid is unchanged and offers Close import. Preview is disabled.
- **Existing entry:** before loading cards, paint October 3 at 19:30 available. It is unchecked in the later busy preview; save only the other two changes and the original cell remains available.
- **Language and keyboard:** change English/Traditional Chinese in Menu. Skip/confirm moves focus to the next heading. Tab reaches labelled fields and buttons. Unknown times disable confirmation.
- **Record lifecycle:** automated fake-media tests cover cancellation, navigation cleanup, late permission completion, denial/retry, duplicate start and the 60-second stop. No actual microphone access is required or claimed.

## Storage and isolation

The fixture transport never calls fetch. Its data uses an explicit localStorage key and schema, and its pending requests are invalidated on reset. Production routes continue requiring real authentication. No query parameter or request header enables mock behavior on the API. `/preview` is gated to development on the server.

The mock is a UI acceptance aid, not a replacement for server versioning, privacy, idempotency or model quality tests. Only confirmed import data and grid state survive reload; unsent typed answers remain in React state and are retained after failed requests, not after a browser reload.
