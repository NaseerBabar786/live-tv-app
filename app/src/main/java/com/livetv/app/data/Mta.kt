package com.livetv.app.data

/**
 * MTA (Muslim Television Ahmadiyya): its own live channels, streamed openly from its own
 * servers, and its programmes in the Library (tv.bulkbazaar.ca/MTA.m3u, from MTA's own
 * YouTube channel). Off until the viewer turns MTA on in Cable TV's Settings.
 */
object Mta {
    const val GROUP = "MTA"
    const val CATEGORY = "Religious"
    const val VIDEOS_URL = "https://tv.bulkbazaar.ca/MTA.m3u"

    /** MTA's own CDN, as used by the player on mta.tv. */
    private const val CDN = "https://dq1c55erlhlb2.cloudfront.net/out/v1/prod-mtai-live-shared"

    private fun channel(name: String, id: String, language: String, logo: String) = Channel(
        name = name,
        url = "$CDN/prod_$id/prod_$id-origin-v1/index-hls.m3u8",
        logo = "https://i.imgur.com/$logo.png",
        group = GROUP,
        language = language,
        category = CATEGORY,
        country = "uk",
    )

    val CHANNELS = listOf(
        channel("MTA1 World", "mta1_world_main", "Urdu", "bYiRfAg"),
        channel("MTA2 Europe", "mta2_europe", "Urdu", "aVts0sz"),
        channel("MTA3 Al-Arabia", "mta3_alarabia", "Arabic", "m3PEldJ"),
        channel("MTA4 Africa", "mta4_africa", "English", "lmVeQQX"),
        channel("MTA5 Africa", "mta5_africa", "English", "9Cobb2i"),
        channel("MTA6 Asia", "mta6_asia", "Urdu", "nhCNPJI"),
        channel("MTA7 Asia", "mta7_asia", "Urdu", "3Nl8Tpu"),
        channel("MTA8 America", "mta8_america", "English", "CF6X9wB"),
    )

    private val urls by lazy { CHANNELS.map { it.url }.toSet() }

    /**
     * Whether [channel] is one of MTA's live channels. When MTA is on they come right after our
     * Bazaar channels (numbers 17 to 24 since 2026-10-08, the other channels from 25) and are free in every package.
     */
    fun isMta(channel: Channel) = channel.url in urls

    /**
     * MTA's old Akamai links, still in the public lists: MTA moved to the CDN above in 2026,
     * and the old ones are refused or all play MTA1, so they are left out.
     */
    private val oldLink = Regex("""^https?://(chlivemta1?|livemtaasia)\.akamaized\.net/""")

    fun isOldLink(url: String) = oldLink.containsMatchIn(url)
}
