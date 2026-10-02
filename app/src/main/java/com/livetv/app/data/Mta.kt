package com.livetv.app.data

/**
 * MTA (Muslim Television Ahmadiyya): its own live channels, streamed openly from its own
 * servers, and its programmes in the Library (tv.bulkbazaar.ca/MTA.m3u, from MTA's own
 * YouTube channel). Off until the viewer turns MTA on in Live TV's Settings.
 */
object Mta {
    const val GROUP = "MTA"
    const val CATEGORY = "Religious"
    const val VIDEOS_URL = "https://tv.bulkbazaar.ca/MTA.m3u"

    private fun channel(name: String, path: String, language: String, logo: String) = Channel(
        name = name,
        url = "https://$path/playlist.m3u8",
        logo = "https://i.imgur.com/$logo.png",
        group = GROUP,
        language = language,
        category = CATEGORY,
        country = "uk",
    )

    val CHANNELS = listOf(
        channel("MTA1 World", "chlivemta1.akamaized.net/hls/live/2008145/mta1", "Urdu", "bYiRfAg"),
        channel("MTA2 Europe", "chlivemta1.akamaized.net/hls/live/2008145/mta2", "Urdu", "aVts0sz"),
        channel("MTA3 Al-Arabia", "chlivemta1.akamaized.net/hls/live/2010556/mta3alarabia", "Arabic", "m3PEldJ"),
        channel("MTA4 Africa", "chlivemta.akamaized.net/hls/live/2010555/mtaafrica1", "English", "lmVeQQX"),
        channel("MTA5 Africa", "chlivemta.akamaized.net/hls/live/2010555/mtaafrica2", "English", "9Cobb2i"),
        channel("MTA6 Asia", "livemtaasia.akamaized.net/hls/live/2039224/mta6asia", "Urdu", "nhCNPJI"),
        channel("MTA7 Asia", "livemtaasia.akamaized.net/hls/live/2039224/mtaasia2", "Urdu", "3Nl8Tpu"),
        channel("MTA8 America", "chlivemta.akamaized.net/hls/live/2016718/mta8", "English", "CF6X9wB"),
    )
}
