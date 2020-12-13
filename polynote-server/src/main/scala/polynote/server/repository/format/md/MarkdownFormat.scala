package polynote.server.repository.format.md

import cats.syntax.either._
import com.vladsch.flexmark.ast._
import com.vladsch.flexmark.ext.yaml.front.matter.{YamlFrontMatterBlock, YamlFrontMatterExtension}
import com.vladsch.flexmark.parser.Parser
import io.circe.syntax._
import io.circe.yaml.Printer
import polynote.data.Rope
import polynote.kernel.RuntimeError.RecoveredException
import polynote.kernel._
import polynote.messages._
import polynote.server.repository.NotebookContent
import polynote.server.repository.format.NotebookFormat
import zio.{RIO, ZIO}

import scala.collection.JavaConverters._


class MarkdownFormat extends NotebookFormat {

  private lazy val parser = Parser.builder().extensions(List(YamlFrontMatterExtension.create()).asJava).build()
  private lazy val printer = Printer.spaces2.copy(dropNullKeys = true)

  override val extension: String = "md"
  override val mime: String = "text/markdown"

  private def textCell(content: String, i: Int) =
    NotebookCell(i, TinyString("text"), Rope(content), ShortList(Nil))

  private def codeCell(node: FencedCodeBlock, i: Int) =
    NotebookCell(i, TinyString(node.getInfo.normalizeEOL()), Rope(node.getContentChars.normalizeEOL()), ShortList(Nil))

  private def collectCells(document: Document): NotebookContent =
    document.getChildren.iterator().asScala.foldLeft((0, 0, NotebookContent(ShortList(Nil), None))) {
      case ((start, end, nb), node) => node match {
        case node: YamlFrontMatterBlock =>
          val content = node.getContentChars.normalizeEOL().stripPrefix("---\n").stripSuffix("\n---")
          val parsed = io.circe.yaml.parser.parse(content)
          val updatedNotebook = parsed.flatMap(_.as[NotebookConfig]).fold(
            err => {err.printStackTrace(); nb},
            config => nb.copy(config = Some(config))
          )
          (node.getEndOffset, node.getEndOffset, updatedNotebook)
        case node: FencedCodeBlock =>
          val preceeding = Option(document.getChars.subSequence(start, end).normalizeEOL())
            .filter(_.nonEmpty)
            .map(textCell(_, nb.cells.size))

          val current = Some(codeCell(node, nb.cells.size + preceeding.size))

          (node.getEndOffset, node.getEndOffset, nb.copy(cells = ShortList(nb.cells ++ Seq(preceeding, current).flatten)))

        case node: BlockQuote if nb.cells.lastOption.exists(_.language != "text") =>
          val children = node.getChildren.asScala.toList
          val parsedChildren = children.collect {
            case child: HtmlBlock => scala.xml.XML.loadString(child.getContentChars.normalizeEOL())
          }
          val parsedResults: ShortList[Result] = ShortList(parsedChildren.flatMap(htmlToResult(_, nb.cells.last.id.toString)))
          (node.getEndOffset, node.getEndOffset, nb.copy(cells = ShortList(nb.cells.dropRight(1) :+ nb.cells.last.copy(results = parsedResults))))

        case other =>
          (start, node.getEndOffset, nb)
      }
    } match {
      case (start, end, nb) if start == end => nb
      case (start, end, nb) => nb.copy(cells = nb.cells :+ textCell(document.getChars.subSequence(start, end).normalizeEOL(), nb.cells.size))
    }

  // To embed results, we actually wrap them in a div so we can recover some metadata about them.
  // These divs will also be placed in a blockquote directly after the cell.
  private def resultToMarkdown(result: Result): String = result match {
    case Output(contentType, content) =>
      val (mimeType, args) = Output.parseContentType(contentType)
      val rel = args.getOrElse("rel", "none")
      <div class="output" rel={rel} mime-type={mimeType}>{scala.xml.Unparsed(content.mkString)}</div>.toString()  // TODO: lose the XML literals

    case CompileErrors(reports) =>
      <div class="errors compile-errors">{reports.map {report =>
        <div
        class="error-report"
        data-start={report.pos.start.toString}
        data-end={report.pos.end.toString}
        data-severity={report.severity.toString}>
          <strong class="severity">{report.severityString}</strong>:
          {report.msg}</div>
      }}</div>.toString()

    case RuntimeError(err) =>
      <div class="errors runtime-error">
        Uncaught exception:
        <span class="message">{err.getMessage}</span> (<span class="err-class">{err.getClass.getName}</span>)
        <ul class="stack-trace">{
          err.getStackTrace.map {
            traceEl =>
              <li data-className={traceEl.getClassName} data-method={traceEl.getMethodName} data-file={traceEl.getFileName} data-line={traceEl.getLineNumber.toString}>
                {traceEl.getClassName}.{traceEl.getMethodName}({traceEl.getFileName}:{traceEl.getLineNumber})
              </li>
          }
          }</ul>
      </div>.toString()

    case ClearResults() => ""
    case ResultValue(_, _, _, _, _, _, _) => "" // TODO
    case ExecutionInfo(_, _) => "" // TODO
  }

  private def htmlToResult(html: scala.xml.Elem, id: String): Option[Result] = html.attribute("class").map(_.head.text).flatMap {
    case "output" =>
      val rel = html.attribute("rel").flatMap(_.headOption.map(_.toString))
      val mime = html.attribute("mime-type").flatMap(_.headOption.map(_.toString)).map {
        t => t + rel.fold("")(rel => s"rel=$rel")
      }.getOrElse("")
      Some(Output(mime, html.child.map(_.toString).mkString))

    case "errors compile-errors" =>
      val reports = html.child.map {
        report => for {
          start <- report.attribute("data-start").flatMap(_.headOption).map(_.toString.toInt)
          end   <- report.attribute("data-end").flatMap(_.headOption).map(_.toString.toInt)
          severity <- report.attribute("data-severity").flatMap(_.headOption).map(_.toString.toInt)
          content = report.child.collect { case scala.xml.Text(str) => str }.mkString
        } yield KernelReport(Pos(id, start, end, start), content, severity)
      }
      Some(CompileErrors(reports.toList.flatMap(_.toList)))

    case "errors runtime-error" => for {
      message <- (html \ "span").filter(_ \@ "class" == "message").headOption.map(_.text)
      clsName <- (html \ "span").filter(_ \@ "class" == "err-class").headOption.map(_.text)
    } yield {
      val traces = (html \ "ul").headOption.toList.flatMap(_ \ "li").map {
        li => new StackTraceElement(li \@ "data-className", li \@ "data-method", li \@ "data-file", (li \@ "data-line").toInt)
      }
      val err = RecoveredException(message, clsName)
      err.setStackTrace(traces.toArray)
      RuntimeError(err)
    }
  }


  private def cellToMarkdown(cell: NotebookCell) = cell.language.toString match {
    case "text" => cell.content.toString.replaceAll("^\\n+|\\n+$", "")
    case other =>
      val outputs = cell.results.map(resultToMarkdown) match {
        case Nil => ""
        case outputs => "\n\n" + outputs.mkString("\n").linesWithSeparators.map(line => s"> $line").mkString
      }

      s"""```${cell.language}
         |${cell.content.toString.stripSuffix("\n")}
         |```$outputs""".stripMargin
  }

  override def decodeNotebook(noExtPath: String, rawContent: String): RIO[BaseEnv with GlobalEnv, Notebook] = for {
    parsed  <- ZIO(parser.parse(rawContent))
  } yield collectCells(parsed).toNotebook(s"$noExtPath.$extension")

  override def encodeNotebook(nb: NotebookContent): RIO[BaseEnv with GlobalEnv, String] = ZIO.succeed {
      nb.config.map(_.asJson).map(printer.pretty).map(yml => s"---\n$yml\n---\n\n").mkString + nb.cells.map(cellToMarkdown).mkString("\n\n").stripPrefix("\n").stripPrefix("\n")
  }
}
