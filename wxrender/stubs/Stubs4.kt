package com.livetv.app.data
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
object ChannelRepository { const val USER_AGENT = "x" }
object Location {
  data class Place(val latitude: Double, val longitude: Double, val city: String, val country: String, val region: String = "") {
    val label get() = listOf(city, region).filter { it.isNotBlank() }.distinct().joinToString(", ")
  }
  val version: StateFlow<Int> = MutableStateFlow(0)
  fun current(): Place? = null
  fun search(n: String): List<Place> = emptyList()
}
