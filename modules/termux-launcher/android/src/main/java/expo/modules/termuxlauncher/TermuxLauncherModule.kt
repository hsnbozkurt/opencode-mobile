package expo.modules.termuxlauncher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val TERMUX_PACKAGE = "com.termux"
private const val TERMUX_RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService"
private const val TERMUX_RUN_COMMAND_ACTION = "com.termux.RUN_COMMAND"
private const val RUN_COMMAND_PERMISSION = "com.termux.permission.RUN_COMMAND"

private const val EXTRA_PATH = "com.termux.RUN_COMMAND_PATH"
private const val EXTRA_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS"
private const val EXTRA_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR"
private const val EXTRA_ENVIRONMENT = "com.termux.RUN_COMMAND_ENVIRONMENT"
private const val EXTRA_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND"
private const val EXTRA_SESSION_NEW = "com.termux.RUN_COMMAND_SESSION_NEW"

class LaunchRequest : Record {
  @Field
  var executable: String = ""

  @Field
  var args: List<String> = emptyList()

  @Field
  var workdir: String? = null

  @Field
  var environment: List<String> = emptyList()

  @Field
  var background: Boolean = true
}

class TermuxLauncherModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("TermuxLauncher")

    AsyncFunction("getStatus") { ->
      val ctx = context
      if (ctx == null) {
        return@AsyncFunction mapOf("available" to false, "installed" to false, "hasRunCommandPermission" to false)
      }
      val installed = isPackageInstalled(ctx, TERMUX_PACKAGE)
      val hasPermission = ctx.checkSelfPermission(RUN_COMMAND_PERMISSION) == PackageManager.PERMISSION_GRANTED
      val version = if (installed) packageVersion(ctx, TERMUX_PACKAGE) else null
      mapOf(
        "available" to (installed && hasPermission),
        "installed" to installed,
        "hasRunCommandPermission" to hasPermission,
        "termuxVersion" to version,
      )
    }

    /**
     * Shows the system runtime-permission dialog for com.termux.permission.RUN_COMMAND.
     * Resolves when the user answers; `granted` is false if Termux is not installed
     * (a permission nobody declares cannot be granted) or the user denies.
     */
    AsyncFunction("requestRunCommandPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, RUN_COMMAND_PERMISSION)
    }

    AsyncFunction("launch") { request: LaunchRequest ->
      val ctx = context
      if (ctx == null) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "launch-failed", "detail" to "No react context")
      }
      if (!isPackageInstalled(ctx, TERMUX_PACKAGE)) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "termux-not-installed")
      }
      if (ctx.checkSelfPermission(RUN_COMMAND_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "permission-denied")
      }
      val intent = Intent(TERMUX_RUN_COMMAND_ACTION).apply {
        component = ComponentName(TERMUX_PACKAGE, TERMUX_RUN_COMMAND_SERVICE)
        putExtra(EXTRA_PATH, request.executable)
        putExtra(EXTRA_ARGUMENTS, request.args.toTypedArray())
        putExtra(EXTRA_BACKGROUND, request.background)
        putExtra(EXTRA_SESSION_NEW, true)
        request.workdir?.let { putExtra(EXTRA_WORKDIR, it) }
        if (request.environment.isNotEmpty()) {
          putExtra(EXTRA_ENVIRONMENT, request.environment.toTypedArray())
        }
      }
      return@AsyncFunction try {
        val started = ctx.startService(intent)
        if (started != null) {
          mapOf("ok" to true)
        } else {
          mapOf("ok" to false, "reason" to "launch-failed", "detail" to "startService returned null")
        }
      } catch (e: SecurityException) {
        mapOf("ok" to false, "reason" to "permission-denied", "detail" to e.message)
      } catch (e: Exception) {
        mapOf("ok" to false, "reason" to "launch-failed", "detail" to e.message)
      }
    }
  }

  private fun isPackageInstalled(ctx: Context, packageName: String): Boolean = try {
    ctx.packageManager.getPackageInfo(packageName, 0)
    true
  } catch (e: PackageManager.NameNotFoundException) {
    false
  }

  private fun packageVersion(ctx: Context, packageName: String): String? = try {
    ctx.packageManager.getPackageInfo(packageName, 0).versionName
  } catch (e: PackageManager.NameNotFoundException) {
    null
  }
}