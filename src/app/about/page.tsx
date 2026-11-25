export const metadata = { title: "How JagaBanjir works" };

export default function About() {
  return (
    <article style={{ maxWidth: "var(--measure)" }}>
      <h1>How it works</h1>
      <p style={{ fontSize: "var(--step-1)" }}>
        Malaysia measures its rivers every 15 minutes. The trouble is getting that number, in plain words, to the person
        who can act on it — often a son or daughter living somewhere else.
      </p>

      <h2>Every 15 minutes</h2>
      <ol>
        <li>
          <strong>Read.</strong> JagaBanjir downloads the live JPS Public InfoBanjir feed: about 1,300 water-level gauges.
        </li>
        <li>
          <strong>Check each gauge.</strong> A reading is trusted only if it is less than 6 hours old, is not marked faulty,
          is not exactly 0 m, is not more than 5 m below its alert level, and did not jump 2 m in one reading.
        </li>
        <li>
          <strong>Decide for each house.</strong> The house takes the highest level among its trusted gauges, using the
          alert, warning and danger levels JPS publishes. If no gauge can be trusted, it says &ldquo;can&apos;t
          tell&rdquo;. It never says &ldquo;normal&rdquo; on bad data.
        </li>
        <li>
          <strong>Write the message.</strong> Fixed, reviewed templates in Malay, Chinese, Tamil and English, with three
          things to do at each level. No AI writes the text.
        </li>
        <li>
          <strong>Check the message.</strong> Every number in it must match the JPS reading. If one does not, the message
          is not sent.
        </li>
        <li>
          <strong>Send once.</strong> One message when the level rises, one when it is back to normal (after holding for
          two readings, so a wobbling river does not spam the family).
        </li>
      </ol>

      <h2>What it is not</h2>
      <ul>
        <li>
          It is not an official warning. NADMA and MCMC send official alerts to phones inside the flood area. JagaBanjir is
          for the family member who is not there.
        </li>
        <li>
          A gauge measures one river at one spot. Flash floods from drains and heavy local rain can happen while the
          nearest gauge stays normal.
        </li>
        <li>
          The &ldquo;time to danger&rdquo; figure is a straight line through the last hour of readings. It is a rough
          guide, not a forecast.
        </li>
        <li>
          About 730 gauges have no published thresholds. For those, JagaBanjir shows the label JPS itself gives the
          reading, and says so.
        </li>
        <li>The Chinese and Tamil messages should be checked by more native speakers before wide use.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        No account. A watch stores the house name you typed, a map point rounded to about 100 m, the gauges you picked,
        the language, and your Telegram chat number if you connect it. Anyone with the watch link can see that page, so
        share it only with family. &ldquo;Stop watching&rdquo; deletes it.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>
          River levels and thresholds: Jabatan Pengairan dan Saliran,{" "}
          <a href="https://publicinfobanjir.water.gov.my/">Public InfoBanjir</a>.
        </li>
        <li>Map and place search: OpenStreetMap and Nominatim.</li>
        <li>
          Code: <a href="https://github.com/ShermaineYap/jagabanjir">github.com/ShermaineYap/jagabanjir</a>.
        </li>
      </ul>
    </article>
  );
}
