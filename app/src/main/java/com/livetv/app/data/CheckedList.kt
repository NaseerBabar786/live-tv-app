package com.livetv.app.data

/**
 * The daily-checked lists on tv.bulkbazaar.ca: every channel from iptv-org and Famelack
 * whose stream was working at the last check (built by tools/check_streams.py).
 */
object CheckedList {
    const val ALL_URL = "https://tv.bulkbazaar.ca/AllChannels.m3u"
    const val MIX_URL = "https://tv.bulkbazaar.ca/LiveTV.m3u"

    /** Fills in the app's language and type names. */
    fun convert(entries: List<Channel>): List<Channel> = entries.map {
        it.copy(language = IptvOrg.languageName(it.language), category = IptvOrg.categoryName(it.category))
    }

    /** The channels of each section's country, under the section's title (or the country's name). */
    fun sections(all: List<Channel>, sections: List<Famelack.Section>): List<Channel> = sections.flatMap { section ->
        val keep = section.languages?.map(Famelack::languageName)?.toSet()
        all.filter { it.country == section.country && (keep == null || it.language in keep) }
            .map { if (section.title.isNotBlank()) it.copy(group = section.title) else it }
    }
}
